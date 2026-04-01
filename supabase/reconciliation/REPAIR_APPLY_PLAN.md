# solicitud-vidamas — repair/apply plan

Updated: 2026-03-23 19:50 UTC
Project: `lszwokdthvgzcjdlwxzp`
Repo: `solicitud-vidamas`

## Goal
Bring local migration history into a state where `supabase db push` only attempts the **true remaining deltas**, instead of replaying March 2026 files that are already effectively live in production.

## Execution result — 2026-03-23

Completed against remote ASTRO DB:
- repaired migration history for `001,002,003,004,005,006,007,008,010,011,012,013`
- applied `202603150009_recibos_backfill_columns.sql`
- applied `20260323193000_restore_v_solicitudes_unified.sql`

Verified after apply:
- all 8 `recibos` backfill columns now exist remotely
- `v_solicitudes_unified` now exists and returns rows
- local `solicitud-vidamas/supabase/migrations/*.sql` versions now all exist in remote `supabase_migrations.schema_migrations`

Note: CLI `supabase db push --dry-run` hit a PgBouncer prepared-statement issue on the pooler connection, so final verification was done by direct SQL inspection of migration history + schema objects.

## Current classification

### Repair as applied
These should be recorded in migration history, not replayed:
- `202603140001`
- `202603140002`
- `202603140003`
- `202603150004`
- `202603150005`
- `202603150006`
- `202603150007`
- `202603150008` *(history only — missing view handled separately below)*
- `202603150010`
- `202603190013`

### Applied during execution
These were the true remaining deltas that were executed:
- `202603150009`
- `20260323193000`

### Split-delta history now baselined
These were repaired as applied so they will not replay:
- `202603160011`
- `202603170012`

Reason: the quality-layer tables were already effectively live, but enum/type history diverged. Any future cleanup should be shipped as a fresh additive alignment migration, not by replaying `011` / `012`.

## New additive artifact created in this repo

### Missing bridge view restored separately
- File: `supabase/migrations/20260323193000_restore_v_solicitudes_unified.sql`
- Purpose: restore only the missing `v_solicitudes_unified` view from old migration `008` without replaying the whole file

## Recommended execution order

### Phase 1 — repair history for clearly-live migrations
Run from this repo:

```bash
supabase migration repair \
  202603140001 202603140002 202603140003 \
  202603150004 202603150005 202603150006 202603150007 202603150008 \
  202603150010 202603190013 \
  --status applied
```

### Phase 2 — verify the dry-run set is now sane
Expected remaining apply candidates after Phase 1:
- `202603150009_recibos_backfill_columns.sql`
- `202603160011_filtro_calidad_quality_layer.sql` *(still blocked; should remain until replaced)*
- `202603170012_filtro_calidad_email_unique_and_override_fixes.sql` *(still blocked; should remain until replaced)*
- `20260323193000_restore_v_solicitudes_unified.sql`

Check with:

```bash
supabase db push --dry-run --include-all
```

### Phase 3 — apply only the safe delta(s)
Safe to apply now:
- `202603150009_recibos_backfill_columns.sql`
- `20260323193000_restore_v_solicitudes_unified.sql`

Do **not** apply `011` / `012` yet.

### Phase 4 — quality-layer follow-up
Before any push that includes `011` / `012`, do a direct catalog inspection and replace them with one fresh additive alignment migration.

Minimum checks needed:
- actual column types for `quality_findings.severity` and `quality_findings.category`
- whether `quality_scope_type` exists and is actually used
- whether the unique/index pieces from `012` are already present

## Acceptance criteria

After Phases 1–3:
- `supabase db push --dry-run --include-all` should no longer propose `001`–`008`, `010`, or `013`
- `v_solicitudes_unified` should exist remotely
- `recibos` should have the 8 backfill columns from `009`
- `011` / `012` should remain the only blocked quality-layer items

## Quick verification queries

### View exists
```sql
select * from v_solicitudes_unified limit 5;
```

### Recibos columns exist
```sql
select contratante_nombre, agente_clave, plan, periodicidad, metodo_pago, tipo_cobro, ref_externa, num_recibo
from recibos
limit 1;
```

## Important safety rule
Do **not** run a blind `supabase db push --include-all` until the dry-run shows only the expected files above.
