# Supabase reconciliation workflow

This folder is the checkpoint between local migrations and what is already live in the ASTRO Supabase project.

## Goal

Before the next structural DB change, confirm that the current migration baseline matches the live project closely enough that new changes can flow through `supabase/migrations/` only.

## Workflow

From the repo root:

```bash
npm run db:project-ref
npm run db:link
export SUPABASE_DB_URL=<remote connection string>
npm run db:pull:remote
npm run db:reconcile
```

## What each step does

1. `db:project-ref` extracts the Supabase project ref from `.env.local` / `.env`
2. `db:link` links the repo to that hosted project in the Supabase CLI
3. `db:pull:remote` connects directly to Postgres and writes `supabase/reconciliation/remote-inventory.json`
4. `db:reconcile` compares that remote inventory against objects defined in `supabase/migrations/`

## Output

- `remote-inventory.json` — live object inventory captured from Postgres system catalogs
- `latest-summary.json` — machine-readable diff summary
- `latest-summary.md` — human-readable review summary

## Success condition

- local-only diffs are understood and intentional
- remote-only diffs are either migrated back into Git or explicitly documented
- the **next** structural DB change starts with:

```bash
npm run db:new-migration -- <change_slug>
```

## Notes

- Bulk data fixes still belong in `supabase/data-fixes/`
- If CLI auth is stale, refresh Supabase auth first for linking; `db:pull:remote` also needs `SUPABASE_DB_URL` set
- If the remote DB major version differs from `supabase/config.toml`, update it before using local Supabase containers
