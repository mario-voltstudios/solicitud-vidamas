# ASTRO Supabase reconciliation notes

Updated: 2026-03-23 18:00 UTC
Repo: `solicitud-vidamas`
Project: `lszwokdthvgzcjdlwxzp`

## What is now true

- Remote inventory export works from this host using the ASTRO pooler DSN.
- Local repo now includes placeholder migrations for the 8 pre-existing remote versions:
  - `20251211125642`
  - `20251212093407`
  - `20251212100523`
  - `20251212101349`
  - `20251212142718`
  - `20260113130811`
  - `20260115131513`
  - `20260115134554`
- `supabase migration list` now shows those 8 versions aligned between local and remote.
- `supabase db push --dry-run --include-all` would still try to push the 13 March 2026 migrations in this repo.

## Critical conclusion

Do **not** push the 13 March migrations as a single batch.

Why:
- remote inventory shows that most of their objects already exist in production
- remote migration history does **not** show those versions as applied
- replaying them now would likely fail on duplicates and/or create drift on objects that already diverged manually

## Current delta summary

After schema-prefix normalization:

- Local-only objects: **3**
- Remote-only objects: **105**

### Local-only objects

These exist in repo migrations but were not found in remote inventory:

- `type:public.finding_category`
- `type:public.finding_severity`
- `view:public.v_solicitudes_unified`

### Interpretation

- `v_solicitudes_unified` is likely a genuine missing view from migration `202603150008_paperform_to_solicitudes_sync.sql`
- `finding_category` / `finding_severity` appear to have been replaced in the live DB by different enum names:
  - remote has `quality_category`
  - remote has `quality_severity`
- That means migration `202603160011_filtro_calidad_quality_layer.sql` is **not** a clean replay candidate even though most of its tables are present remotely

## Recommended path

1. Treat the 8 remote placeholder versions as the historical baseline
2. Review each March migration and classify it:
   - already live → mark as baseline/applied in migration history only
   - partially live / diverged → split remaining true delta into new migration(s)
   - genuinely unapplied → keep as runnable migration
3. Create fresh additive migrations only for the true remaining deltas
4. Only then run `supabase db push`

## Likely March classification to verify next

- `202603140001`–`202603150010`: mostly already represented in live DB
- `202603160011`: partially diverged (enum names differ)
- `202603170012`: likely partially/live depending on current constraints/indexes
- `202603190013`: likely mostly live because `cfdi_extractions` exists remotely

## Working files

- `supabase/reconciliation/remote-inventory.json`
- `supabase/reconciliation/latest-summary.json`
- `supabase/reconciliation/latest-summary.md`

## Per-migration decision matrix — 13 March 2026 set

Legend:
- **Repair as applied** = do not replay the file; repair migration history only
- **Split delta** = some parts are live, some are not; create fresh additive migration(s) for the true remaining delta
- **Keep runnable** = migration still appears genuinely unapplied and safe to run

1. **`202603140001_solicitudes_normalized.sql`**
   - Decision: **Repair as applied**
   - Evidence: `solicitud_beneficiarios`, `v_solicitud_with_beneficiarios`, and `trg_check_beneficiario_pct` are present remotely
   - Notes: trigger / index catalog was not directly inspected, but core schema is already live

2. **`202603140002_poliza_reconciliation.sql`**
   - Decision: **Repair as applied**
   - Evidence: `polizas`, `reconciliation_checks`, `v_polizas_pending_reconciliation`, and `fn_create_reconciliation_checks` are present remotely

3. **`202603140003_recibos_lifecycle.sql`**
   - Decision: **Repair as applied**
   - Evidence: `recibos`, `v_recibos_current`, `v_recibos_cobranza_resumen`, `v_recibos_all_history`, and `fn_create_replacement_recibo` are present remotely
   - Extra: remote `recibos` currently has `0` rows, so schema exists but lifecycle data has not been backfilled yet

4. **`202603150004_solicitud_documentos.sql`**
   - Decision: **Repair as applied**
   - Evidence: `solicitud_documentos`, `v_solicitud_documentos_latest`, `v_solicitud_doc_completeness`, `trg_set_updated_at`, and `trg_sol_docs_mark_latest` are present remotely

5. **`202603150005_solicitud_status_history.sql`**
   - Decision: **Repair as applied**
   - Evidence: `solicitud_status_history`, `v_solicitud_status_current`, `fn_transition_solicitud_status`, and `trg_solicitud_initial_status` are present remotely

6. **`202603150006_agentes_schema.sql`**
   - Decision: **Repair as applied**
   - Evidence: `agentes`, `v_agentes_activos`, and `trg_set_updated_at` are present remotely

7. **`202603150007_solicitudes_minor_gaps.sql`**
   - Decision: **Repair as applied**
   - Evidence: all four added columns are already present remotely: `base_calculo`, `nombre_agente`, `week_number`, `year`

8. **`202603150008_paperform_to_solicitudes_sync.sql`**
   - Decision: **Split delta**
   - Evidence already live: `solicitudes.source`, `solicitudes.paperform_submission_id`, `solicitudes_paperform.merged_to_solicitud_id`, `solicitudes_paperform.merged_at`, and `fn_merge_paperform_submission`
   - Evidence still missing: `v_solicitudes_unified` is absent remotely (`404` via PostgREST and absent from remote inventory)
   - Action: repair history for the already-live pieces; if the bridge view is still needed, ship it as a fresh additive migration instead of replaying full `008`

9. **`202603150009_recibos_backfill_columns.sql`**
   - Decision: **Keep runnable**
   - Evidence: all eight added columns are still absent remotely: `contratante_nombre`, `agente_clave`, `plan`, `periodicidad`, `metodo_pago`, `tipo_cobro`, `ref_externa`, `num_recibo`
   - Extra: `recibos` has `0` rows remotely, so this is a low-risk additive apply candidate

10. **`202603150010_etl_paperform_to_solicitudes_fixed.sql`**
   - Decision: **Repair as applied**
   - Evidence: all additive `solicitudes` columns from this migration are already present remotely, plus `pf_extract_url`, `pf_parse_date_parts`, `fn_merge_paperform_submission_v2`, and `fn_backfill_all_paperform` are present
   - Note: this supersedes the earlier ETL path from `008`

11. **`202603160011_filtro_calidad_quality_layer.sql`**
   - Decision: **Split delta — do not replay wholesale**
   - Evidence already live: `quality_runs`, `quality_findings`, `quality_overrides`, `policy_quality_state`, `email_policy_events`, and `email_event_type`
   - Divergence: repo expects enum types `finding_severity` and `finding_category`, but remote inventory does **not** show those types; earlier reconciliation indicates remote instead has `quality_severity` / `quality_category`
   - Action: create a fresh follow-up migration for the real quality-layer alignment instead of replaying `011`

12. **`202603170012_filtro_calidad_email_unique_and_override_fixes.sql`**
   - Decision: **Split delta / fold into quality follow-up**
   - Evidence already live: `quality_findings.resolved_at`, `quality_findings.resolution_notes`, and `quality_runs.status` are present remotely
   - Caution: this file also targets `quality_scope_type`, which does not match the current repo definition in `011`; unique-constraint / index state still needs direct catalog inspection if we want byte-level parity
   - Action: do not replay whole `012`; if any constraint/index is still missing, add it in the same fresh quality follow-up migration used for `011`

13. **`202603190013_cfdi_extractions.sql`**
   - Decision: **Repair as applied**
   - Evidence: `cfdi_extractions` exists remotely; core columns are present; both policies from this migration are present in remote inventory; table already contains rows
   - Note: if we later find an index / RLS mismatch, fix it with a small additive migration rather than replaying `013`

## Recommended execution order

1. Repair migration history for the cleanly-live files:
   - `202603140001`
   - `202603140002`
   - `202603140003`
   - `202603150004`
   - `202603150005`
   - `202603150006`
   - `202603150007`
   - `202603150010`
   - `202603190013`
2. Keep `202603150009` as the one clearly runnable migration
3. Replace `202603150008` with a fresh additive migration only for `v_solicitudes_unified` (if still needed)
4. Replace `202603160011` + `202603170012` with a fresh quality-layer alignment migration after direct catalog verification
5. Only then run `supabase db push`

## Implemented artifacts (2026-03-23)

- `supabase/reconciliation/REPAIR_APPLY_PLAN.md`
  - concrete repair/apply runbook for `solicitud-vidamas`
- `supabase/migrations/20260323193000_restore_v_solicitudes_unified.sql`
  - restores only the missing `v_solicitudes_unified` view as a fresh additive migration

## Execution result (2026-03-23)

Completed on remote ASTRO DB:
- repaired migration history for `001,002,003,004,005,006,007,008,010,011,012,013`
- applied `202603150009_recibos_backfill_columns.sql`
- applied `20260323193000_restore_v_solicitudes_unified.sql`

Verified:
- all 8 `recibos` backfill columns now exist
- `v_solicitudes_unified` now exists and returns rows
- all local `solicitud-vidamas` migration versions are now present in remote `supabase_migrations.schema_migrations`

Implementation note:
- the standalone view migration had to be adjusted for the real `solicitudes_paperform` schema (`numero_solicitud AS folio`, `score::text AS status`, `solicitudes.id::text`) before it would compile on production
