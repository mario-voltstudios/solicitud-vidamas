#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timezone

import psycopg2

output_path = sys.argv[1] if len(sys.argv) > 1 else 'supabase/reconciliation/remote-inventory.json'
db_url = os.environ.get('SUPABASE_DB_URL') or os.environ.get('DATABASE_URL')

if not db_url:
    print('Missing SUPABASE_DB_URL / DATABASE_URL in environment.', file=sys.stderr)
    sys.exit(1)

conn = psycopg2.connect(db_url)
cur = conn.cursor()

objects = set()

def add(kind, name):
    objects.add(f'{kind}:{name.lower()}')

cur.execute("""
    select n.nspname, c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
""")
for schema, name, relkind in cur.fetchall():
    kind = 'table' if relkind in ('r', 'p') else 'view'
    add(kind, f'{schema}.{name}')

cur.execute("""
    select n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
""")
for schema, name in cur.fetchall():
    add('function', f'{schema}.{name}')

cur.execute("""
    select n.nspname, t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype = 'e'
""")
for schema, name in cur.fetchall():
    add('type', f'{schema}.{name}')

cur.execute("""
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
""")
for schema, table, policy in cur.fetchall():
    add('policy', f'{schema}.{table}:{policy}')

cur.close()
conn.close()

payload = {
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'source': 'postgres-catalog',
    'schema': 'public',
    'objects': sorted(objects),
}

os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, indent=2)
    fh.write('\n')

print(output_path)
print(f'objects={len(payload["objects"])}')
