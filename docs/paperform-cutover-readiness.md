# Paperform cutover readiness — P0

_Last checked: 2026-05-09 UTC_

## Current result

From the app perspective, the new Next.js intake can replace Paperform once Mario approves the public redirect/cutover. Paperform should remain read-only/backup until that approval.

Production evidence from the 2026-05-09 readiness run:

- Recent fixture Paperform row `69dd66c5e0e7099896031399` transforms correctly from `raw_data.data`.
- April stranded rows where `numero_solicitud IS NULL`: `0`.
- Migratable Paperform backlog where `merged_to_solicitud_id IS NULL`, `raw_data IS NOT NULL`, and non-demo id: `0`.
- `fn_backfill_all_paperform` dry-run RPC reachable: HTTP `200`.

## Smoke check

Run the read-only cutover smoke before any go-live step:

```bash
node scripts/check-paperform-cutover.mjs --since=2026-04-01
```

The script checks:

1. No recent stranded `solicitudes_paperform` rows with missing `numero_solicitud`.
2. No migratable Paperform backlog remains unmerged.
3. Known non-migratable exceptions are isolated to demo/null-`raw_data` rows.
4. `v_solicitudes_unified`, `solicitudes`, and `fn_backfill_all_paperform(p_dry_run=true)` are reachable.

It performs no database writes; the RPC call is dry-run only.

## Airtable backup de-risking

`createAirtableRecord()` now supports a no-op feature flag:

```bash
AIRTABLE_BACKUP_ENABLED=false
```

Default behavior is unchanged. Set the flag to `false`, `0`, `no`, or `off` when Mario wants the Airtable fire-and-forget backup disabled without removing the code path. This does not affect the canonical `solicitudes` insert.

## Rollback plan

- Keep Paperform available as read-only/backup until Mario explicitly approves final redirect.
- If new-intake issues appear, revert traffic to Paperform and keep `solicitudes_paperform` sync active.
- Use `v_solicitudes_unified` for reporting continuity during the fallback window.
- Re-run `node scripts/check-paperform-cutover.mjs --since=2026-04-01` after rollback/retry to confirm no migratable backlog accumulated.

## Go-live blockers / approvals

- Mario approval for public redirect away from Paperform.
- Confirm production environment flag choice for Airtable backup (`AIRTABLE_BACKUP_ENABLED=false` recommended for cutover if Airtable is legacy-only).
- Confirm Paperform remains backup/read-only, not deleted or publicly disabled, until stable go-live window completes.
