-- ============================================================
-- VidaMás — Phase 2A Schema Migration
-- 007_solicitudes_minor_gaps.sql
-- ============================================================
-- PURPOSE:
--   Add the small but clearly-justified column gaps identified
--   in GAP_ANALYSIS.md (§ 3. Phase 2A, item 3).
--
-- ONLY adds columns that:
--   a) Already exist in the TypeScript FormData type, AND
--   b) Are written / read in production code, AND
--   c) Were missing from the 001 migration.
--
-- Columns NOT added here (require Mario's decision):
--   - semana_id FK (needs confirmed semanas table schema)
--   - Airtable operational columns (P2/P3 scope)
--   - asegurado CURP / address (pending GNP requirements clarification)
-- ============================================================

-- ----------------------------------------------------------
-- 1. base_calculo — exists in FormData.base_calculo,
--    written in extractPlanInfo(), default 'prima'
-- ----------------------------------------------------------
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS base_calculo text DEFAULT 'prima';

COMMENT ON COLUMN solicitudes.base_calculo IS
  'Calculation basis for prima. "prima" = flat premium, '
  '"suma_asegurada" = sum insured basis. Matches FormData.base_calculo.';

-- ----------------------------------------------------------
-- 2. nombre_agente — in FormData.nombre_agente, used in
--    display (StepAgent.tsx) and Airtable writes.
--    Denormalized for convenience; joins to agentes.nombre_completo.
-- ----------------------------------------------------------
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS nombre_agente text;

COMMENT ON COLUMN solicitudes.nombre_agente IS
  'Denormalized agent display name at time of submission. '
  'Authoritative value lives in agentes.nombre_completo; '
  'this column is for convenience queries and audit.';

-- ----------------------------------------------------------
-- 3. week_number + year — in FormData, used by generateFolio().
--    Not a FK (semanas table schema not yet migrated), but
--    the numeric values are useful for partitioned queries.
-- ----------------------------------------------------------
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS week_number smallint,
  ADD COLUMN IF NOT EXISTS year        smallint;

COMMENT ON COLUMN solicitudes.week_number IS
  'ISO week number extracted from the active semana at submission time. '
  'Also encoded in the folio string: {clave}-{year}-S{week_number}-{n}.';

COMMENT ON COLUMN solicitudes.year IS
  'Calendar year of the submission semana.';

-- ----------------------------------------------------------
-- 4. Index: support fast queries by week/year for reporting
--    (v_produccion_semanal pattern)
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_solicitudes_week_year
  ON solicitudes(year, week_number)
  WHERE year IS NOT NULL;

-- ----------------------------------------------------------
-- 5. Index: support fast queries by agent + status
-- ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_solicitudes_agente_status
  ON solicitudes(clave_agente, status);
