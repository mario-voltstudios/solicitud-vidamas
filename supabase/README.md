# Supabase — Solicitud VidaMás

This directory is now the **schema source of truth** for ASTRO intake / reconciliation work.

## Rules
- Structural DB changes go in `migrations/`
- Bulk data fixes go in `data-fixes/`
- Do not rely on manual SQL editor history as the only record

## Current state
Historical SQL from `../sql/` has been mirrored into `migrations/` so ASTRO can follow the same Supabase migration pattern already used in other repos.

Canonical migration coverage here includes:
- solicitudes normalization
- póliza reconciliation
- recibos lifecycle
- documentos + status history
- agentes schema
- Paperform sync / ETL fixes
- filtro de calidad quality layer
- CFDI extraction audit table

## Legacy note
`../sql/` remains as a readable reference for now, but new structural changes should start in `migrations/` first.

## CLI workflow
The repo is now wired for a repeatable hosted-project workflow:

```bash
npm run db:project-ref
npm run db:link
export SUPABASE_DB_URL=<remote connection string>
npm run db:pull:remote
npm run db:reconcile
npm run db:new-migration -- <change_slug>
```

That flow links the hosted ASTRO project, pulls a remote schema snapshot, reconciles it against `migrations/`, and then routes the next structural change through a real migration file.

## Data-fix rule
For any mass update / delete / reconciliation / backfill, create a recovery package in `data-fixes/` with:
- `manifest.md`
- `backup.sql`
- `apply.sql`
- `restore.sql`
- `verify.sql`

Helper (from repo root):

```bash
node scripts/new-data-fix.cjs your_change_slug
```

See [CHANGE_SAFETY.md](./CHANGE_SAFETY.md) for the operating rules.
See [reconciliation/README.md](./reconciliation/README.md) for the baseline-vs-live reconciliation workflow.
