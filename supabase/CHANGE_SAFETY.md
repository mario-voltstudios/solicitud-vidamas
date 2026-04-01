# Change Safety — Solicitud VidaMás

## Schema changes
- Source of truth: `supabase/migrations/`
- New structural changes start there, not only in ad hoc SQL editor history
- Legacy `sql/` files can remain as readable references

## Bulk data fixes
Before any mass update / delete / reconciliation / backfill:
1. create a folder in `supabase/data-fixes/`
2. include:
   - `manifest.md`
   - `backup.sql`
   - `apply.sql`
   - `restore.sql`
   - `verify.sql`
3. validate row counts before and after

## Deletes
- Prefer soft delete / archive status where the domain allows it
- If hard delete is unavoidable, require backup + restore + verify files

## Big backfills / reconciliations
- Prefer append-only logs or audit artifacts
- Make reruns idempotent when possible
- Batch by deterministic keys

## Helper
From repo root:

```bash
node scripts/new-data-fix.cjs your_change_slug
```
