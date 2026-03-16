-- ============================================================
-- VidaMás — Phase 1 Truth Layer
-- 008_paperform_to_solicitudes_sync.sql
--
-- PURPOSE:
--   Close the #1 dual-source-of-truth gap: Paperform submissions
--   live in `solicitudes_paperform` but cannot participate in
--   the canonical solicitud → poliza → recibos pipeline because
--   polizas.solicitud_id only references `solicitudes`.
--
-- STRATEGY:
--   Phase A (this file): Structural changes that are safe to run.
--     - Add `paperform_submission_id` to solicitudes for lineage.
--     - Add `merged_to_solicitud_id` to solicitudes_paperform to
--       mark which rows have been ETL'd into solicitudes.
--     - Create ETL function fn_merge_paperform_submission() that
--       maps a solicitudes_paperform row into solicitudes format.
--     - Create a view v_solicitudes_unified that presents both
--       tables in a unified shape (no-data-migration version for
--       reporting continuity during the migration window).
--
--   Phase B (run separately, after Mario review):
--     - Backfill: call fn_merge_paperform_submission() for each
--       unmerged Paperform row. Creates canonical solicitud rows
--       with source='paperform_migration'.
--     - After backfill, v_produccion_semanal can be updated to
--       prefer solicitudes over solicitudes_paperform.
--
-- FIELD MAPPING (Paperform → solicitudes):
--   solicitudes_paperform.folio        → solicitudes.folio
--   solicitudes_paperform.clave_agente → solicitudes.clave_agente
--   solicitudes_paperform.dependencia  → solicitudes.contratante_dependencia
--   solicitudes_paperform.prima        → solicitudes.prima_base (text→numeric cast)
--   solicitudes_paperform.nombres_contratante → solicitudes.contratante_nombres
--   (remaining fields are NULL in merged rows — must be enriched manually or via
--    Paperform API using field ID 7o5sb → folio for lookup)
--
-- CANONICAL RULE (after migration):
--   solicitudes is the ONE source of truth.
--   solicitudes_paperform is legacy/read-only.
--   polizas.solicitud_id → solicitudes.id (no exceptions).
-- ============================================================

-- ----------------------------------------------------------
-- 1. Add lineage columns (safe, additive)
-- ----------------------------------------------------------

-- On solicitudes: track if this row was created from a Paperform submission
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS source              text DEFAULT 'wizard',
  ADD COLUMN IF NOT EXISTS paperform_submission_id text;
    -- 'wizard'             — created by Next.js intake wizard (default)
    -- 'paperform_direct'   — Paperform webhook writes directly here (future)
    -- 'paperform_migration' — ETL'd from solicitudes_paperform (backfill)
    -- 'manual'             — manually entered by ops

COMMENT ON COLUMN solicitudes.source IS
  'Origin of this solicitud row. '
  'wizard = Next.js wizard; paperform_migration = ETL''d from solicitudes_paperform; '
  'paperform_direct = Paperform webhook (future canonical path).';

COMMENT ON COLUMN solicitudes.paperform_submission_id IS
  'Paperform submission ID from solicitudes_paperform.id when this row '
  'was created via ETL. NULL for wizard-submitted solicitudes.';

-- On solicitudes_paperform: track merge status
ALTER TABLE solicitudes_paperform
  ADD COLUMN IF NOT EXISTS merged_to_solicitud_id uuid REFERENCES solicitudes(id),
  ADD COLUMN IF NOT EXISTS merged_at              timestamptz;

COMMENT ON COLUMN solicitudes_paperform.merged_to_solicitud_id IS
  'UUID of the canonical solicitudes row this Paperform submission was merged into. '
  'NULL = not yet merged. Non-null = archived (do not use for operational queries).';

-- Index for merge status queries
CREATE INDEX IF NOT EXISTS idx_paperform_merged
  ON solicitudes_paperform(merged_to_solicitud_id)
  WHERE merged_to_solicitud_id IS NOT NULL;

-- ----------------------------------------------------------
-- 2. ETL function: merge one Paperform submission into solicitudes
-- ----------------------------------------------------------
-- Call this for each row in solicitudes_paperform that needs to
-- be promoted to the canonical pipeline.
--
-- Returns the UUID of the created (or pre-existing) solicitudes row.
--
-- Safety: if the folio already exists in solicitudes, returns
-- that row's ID and updates the Paperform merged_to pointer.
-- Does NOT create duplicates.
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_merge_paperform_submission(p_paperform_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_pf          solicitudes_paperform%ROWTYPE;
  v_sol_id      uuid;
  v_prima_num   numeric(10,2);
BEGIN
  -- Fetch the Paperform row
  SELECT * INTO v_pf FROM solicitudes_paperform WHERE id = p_paperform_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitudes_paperform row % not found', p_paperform_id;
  END IF;

  IF v_pf.merged_to_solicitud_id IS NOT NULL THEN
    -- Already merged; return existing
    RETURN v_pf.merged_to_solicitud_id;
  END IF;

  -- Check if folio already exists in solicitudes (idempotent)
  SELECT id INTO v_sol_id FROM solicitudes WHERE folio = v_pf.folio LIMIT 1;

  IF v_sol_id IS NULL THEN
    -- Cast prima text → numeric, handling commas and empty strings
    BEGIN
      v_prima_num := REPLACE(COALESCE(v_pf.prima, '0'), ',', '')::numeric;
    EXCEPTION WHEN others THEN
      v_prima_num := NULL;
    END;

    -- Insert canonical row
    -- NOTE: only fields available in solicitudes_paperform are populated.
    -- The rest remain NULL for manual/OCR enrichment.
    INSERT INTO solicitudes (
      folio,
      clave_agente,
      contratante_dependencia,
      prima_base,
      source,
      paperform_submission_id,
      status,
      created_at
    ) VALUES (
      v_pf.folio,
      v_pf.clave_agente,
      v_pf.dependencia,
      v_prima_num,
      'paperform_migration',
      p_paperform_id::text,
      COALESCE(v_pf.status, 'pendiente'),
      COALESCE(v_pf.created_at, now())
    )
    RETURNING id INTO v_sol_id;
  END IF;

  -- Mark the Paperform row as merged
  UPDATE solicitudes_paperform
    SET merged_to_solicitud_id = v_sol_id,
        merged_at              = now()
  WHERE id = p_paperform_id;

  RETURN v_sol_id;
END;
$$;

COMMENT ON FUNCTION fn_merge_paperform_submission IS
  'ETL a single solicitudes_paperform row into the canonical solicitudes table. '
  'Safe to call multiple times (idempotent by folio). '
  'Returns the UUID of the canonical solicitudes row. '
  'Run for all unmerged rows to close the dual-source-of-truth gap.';

-- ----------------------------------------------------------
-- 3. Batch backfill helper (run ONCE during migration window)
-- ----------------------------------------------------------
-- DO $$
-- DECLARE
--   v_row solicitudes_paperform%ROWTYPE;
--   v_count int := 0;
-- BEGIN
--   FOR v_row IN
--     SELECT * FROM solicitudes_paperform
--     WHERE merged_to_solicitud_id IS NULL
--     ORDER BY created_at
--   LOOP
--     PERFORM fn_merge_paperform_submission(v_row.id);
--     v_count := v_count + 1;
--   END LOOP;
--   RAISE NOTICE 'Merged % Paperform submissions into solicitudes', v_count;
-- END;
-- $$;
--
-- UNCOMMENT AND RUN ONLY AFTER:
--   (a) solicitudes_paperform column list confirmed against production schema
--   (b) Mario reviews and approves the backfill
--   (c) v_produccion_semanal updated to prefer solicitudes source

-- ----------------------------------------------------------
-- 4. v_solicitudes_unified — reporting bridge during migration
-- ----------------------------------------------------------
-- Union view that presents both tables in a unified shape.
-- Use for reporting queries that need to cover both sources
-- during the migration window.
-- After backfill is complete, this view can be simplified to
-- just SELECT * FROM solicitudes.
-- ----------------------------------------------------------

CREATE OR REPLACE VIEW v_solicitudes_unified AS
  -- Canonical (wizard + migrated Paperform)
  SELECT
    id,
    folio,
    clave_agente,
    contratante_dependencia    AS dependencia,
    prima_base                 AS prima,
    status,
    source,
    created_at,
    'solicitudes'              AS _source_table
  FROM solicitudes

  UNION ALL

  -- Paperform rows not yet merged
  SELECT
    id,
    folio,
    clave_agente,
    dependencia,
    NULLIF(REPLACE(COALESCE(prima,'0'),',',''), '')::numeric AS prima,
    status,
    'paperform_legacy'         AS source,
    created_at,
    'solicitudes_paperform'    AS _source_table
  FROM solicitudes_paperform
  WHERE merged_to_solicitud_id IS NULL;

COMMENT ON VIEW v_solicitudes_unified IS
  'Unified solicitudes view covering both canonical solicitudes and unmerged '
  'solicitudes_paperform rows. _source_table = "solicitudes_paperform" indicates '
  'rows that have not yet been promoted to the canonical pipeline. '
  'After backfill completes, query solicitudes directly.';
