-- ============================================================
-- Restore missing bridge view: v_solicitudes_unified
-- Created: 2026-03-23
--
-- Why this exists:
-- - Most of migration 202603150008 is already live in production
-- - Replaying the full migration is unnecessary and risky
-- - The one verified missing piece is the reporting bridge view
--
-- Safe behavior:
-- - CREATE OR REPLACE VIEW only
-- - No table/function rewrites
-- ============================================================

CREATE OR REPLACE VIEW v_solicitudes_unified AS
  -- Canonical (wizard + migrated Paperform)
  SELECT
    id::text                   AS id,
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
    numero_solicitud            AS folio,
    clave_agente,
    dependencia,
    NULLIF(REPLACE(COALESCE(prima,'0'),',',''), '')::numeric AS prima,
    COALESCE(score::text, 'pendiente') AS status,
    'paperform_legacy'         AS source,
    created_at,
    'solicitudes_paperform'    AS _source_table
  FROM solicitudes_paperform
  WHERE merged_to_solicitud_id IS NULL;

COMMENT ON VIEW v_solicitudes_unified IS
  'Unified solicitudes view covering both canonical solicitudes and unmerged '
  'solicitudes_paperform rows. _source_table = "solicitudes_paperform" indicates '
  'rows that have not yet been promoted to the canonical pipeline. '
  'Restored as a standalone delta after March 2026 reconciliation.';
