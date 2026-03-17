#!/usr/bin/env python3
"""
backfill_paperform.py — Execute the Paperform → solicitudes ETL backfill

Usage:
    python3 scripts/backfill_paperform.py --dry-run        # count only, no writes
    python3 scripts/backfill_paperform.py --batch 100      # test batch of 100
    python3 scripts/backfill_paperform.py --full           # full backfill (5080 rows)

Prerequisites:
    1. Run sql/010_etl_paperform_to_solicitudes_fixed.sql against the DB first
    2. Set SUPABASE_URL and SUPABASE_KEY env vars or update the constants below

Author: Jarvis subagent 2026-03-16
"""

import os, sys, json, urllib.request, urllib.parse, argparse, time
from datetime import datetime

SUPABASE_URL = os.environ.get('SUPABASE_URL') or 'https://lszwokdthvgzcjdlwxzp.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_KEY') or ''

if not SUPABASE_KEY:
    # Try to load from workspace .env
    env_path = os.path.expanduser('~/.openclaw/.env')
    if os.path.exists(env_path):
        for line in open(env_path):
            line = line.strip()
            if line.startswith('SUPABASE_KEY='):
                SUPABASE_KEY = line.split('=', 1)[1]
                break

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
}


def rpc(fn_name: str, params: dict) -> dict:
    """Call a Supabase RPC function."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}"
    body = json.dumps(params).encode()
    req = urllib.request.Request(url, data=body, headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"RPC {fn_name} failed {e.code}: {body}")


def get_pending_count() -> int:
    url = f"{SUPABASE_URL}/rest/v1/solicitudes_paperform?merged_to_solicitud_id=is.null&select=count"
    req = urllib.request.Request(url, headers={**HEADERS, 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0'})
    with urllib.request.urlopen(req) as r:
        range_hdr = r.headers.get('Content-Range', '*/0')
        total = range_hdr.split('/')[-1]
        return int(total) if total != '*' else 0


def get_migration_count() -> int:
    url = f"{SUPABASE_URL}/rest/v1/solicitudes?source=eq.paperform_migration&select=count"
    req = urllib.request.Request(url, headers={**HEADERS, 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0'})
    with urllib.request.urlopen(req) as r:
        range_hdr = r.headers.get('Content-Range', '*/0')
        total = range_hdr.split('/')[-1]
        return int(total) if total != '*' else 0


def main():
    parser = argparse.ArgumentParser(description='Paperform → solicitudes backfill')
    parser.add_argument('--dry-run', action='store_true', help='Count only, no writes')
    parser.add_argument('--batch', type=int, default=None, help='Process N rows')
    parser.add_argument('--full', action='store_true', help='Full backfill (all pending rows)')
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"Paperform → solicitudes Backfill")
    print(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    print(f"{'='*60}\n")

    # Pre-flight check
    pending = get_pending_count()
    already_migrated = get_migration_count()
    print(f"Pending (not yet merged): {pending:,}")
    print(f"Already migrated:         {already_migrated:,}\n")

    if pending == 0:
        print("✅ Nothing to do — all rows already merged.")
        return

    if args.dry_run:
        print("DRY RUN — calling fn_backfill_all_paperform(p_dry_run=true) ...")
        result = rpc('fn_backfill_all_paperform', {'p_dry_run': True})
        print(f"\nDry run result: {result}")
        print(f"\nWould process {result[0]['processed']:,} rows.")
        print("Re-run with --batch 100 to test, or --full for the full backfill.")
        return

    if args.batch:
        print(f"BATCH MODE — processing up to {args.batch} rows ...")
        t0 = time.time()
        result = rpc('fn_backfill_all_paperform', {'p_dry_run': False, 'p_limit': args.batch})
        elapsed = time.time() - t0
        row = result[0]
        print(f"\nBatch result ({elapsed:.1f}s):")
        print(f"  Processed: {row['processed']:,}")
        print(f"  Merged:    {row['merged']:,}")
        print(f"  Skipped:   {row['skipped']:,}")
        print(f"  Errors:    {row['errors']:,}")
        after = get_migration_count()
        print(f"\nTotal migrated rows now: {after:,}")
        if row['errors'] > 0:
            print(f"\n⚠️  {row['errors']} errors — check Supabase logs before running full backfill.")
            sys.exit(1)
        else:
            print(f"\n✅ Batch complete with 0 errors.")
        return

    if args.full:
        print(f"FULL BACKFILL — processing all {pending:,} rows ...")
        print("This may take a few minutes. DO NOT interrupt.\n")
        t0 = time.time()
        result = rpc('fn_backfill_all_paperform', {'p_dry_run': False})
        elapsed = time.time() - t0
        row = result[0]
        print(f"\nFull backfill complete ({elapsed:.1f}s):")
        print(f"  Processed: {row['processed']:,}")
        print(f"  Merged:    {row['merged']:,}")
        print(f"  Skipped:   {row['skipped']:,}")
        print(f"  Errors:    {row['errors']:,}")
        after = get_migration_count()
        still_pending = get_pending_count()
        print(f"\nTotal migrated rows:   {after:,}")
        print(f"Still unmerged:        {still_pending:,}")
        if row['errors'] > 0:
            print(f"\n⚠️  {row['errors']} errors — run with --batch to isolate problem rows.")
            sys.exit(1)
        elif still_pending == 0:
            print(f"\n✅ Backfill complete — all {row['processed']:,} rows migrated with 0 errors.")
        else:
            print(f"\n⚠️  {still_pending} rows still unmerged after full backfill. Check error logs.")
        return

    parser.print_help()


if __name__ == '__main__':
    main()
