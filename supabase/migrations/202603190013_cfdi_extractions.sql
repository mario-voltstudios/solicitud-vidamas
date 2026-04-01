-- ============================================================
-- CFDI Extractions Table
-- 013_cfdi_extractions.sql
-- Created: 2026-03-19
--
-- Stores one row per CFDI extraction attempt for a talon/paystub.
-- Powers:
--   1. Duplicate UUID detection (across solicitudes)
--   2. SAT verification result audit trail
--   3. OCR + extraction provenance
-- ============================================================

CREATE TABLE IF NOT EXISTS cfdi_extractions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  solicitud_id          uuid        REFERENCES solicitudes(id) ON DELETE SET NULL,
  quality_run_id        uuid        REFERENCES quality_runs(id) ON DELETE SET NULL,

  -- Source document
  source_doc_path       text        NOT NULL,
  extraction_method     text        NOT NULL CHECK (
    extraction_method IN ('qr_url', 'ocr_fallback', 'manual')
  ),

  -- Parsed QR data (JSONB — null if extraction failed)
  -- Expected shape: { uuid, rfc_emisor, rfc_receptor, total, sello_tail, source_url }
  qr_data               jsonb,

  -- SAT verification result (JSONB — null if not yet verified)
  -- Expected shape: { reachable, status, cancel_reason, raw_response, error, verified_at }
  sat_result            jsonb,

  -- Duplicate detection
  duplicate_detected    boolean     NOT NULL DEFAULT false,
  duplicate_solicitud_ids uuid[]    DEFAULT '{}',

  -- Timestamps
  extracted_at          timestamptz NOT NULL DEFAULT now(),

  -- Warnings from extraction process
  warnings              text[]      DEFAULT '{}'
);

-- ──────────────────────────────────────────────────────────────
-- Indexes
-- ──────────────────────────────────────────────────────────────

-- Fast lookup of all extractions for a solicitud
CREATE INDEX IF NOT EXISTS cfdi_extractions_solicitud_idx
  ON cfdi_extractions (solicitud_id);

-- Duplicate UUID detection: look up by uuid inside qr_data JSONB
-- Usage: SELECT * FROM cfdi_extractions WHERE qr_data->>'uuid' = $1
CREATE INDEX IF NOT EXISTS cfdi_extractions_uuid_idx
  ON cfdi_extractions ((qr_data->>'uuid'))
  WHERE qr_data IS NOT NULL;

-- Fast lookup by quality run
CREATE INDEX IF NOT EXISTS cfdi_extractions_run_idx
  ON cfdi_extractions (quality_run_id)
  WHERE quality_run_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- RLS (Row Level Security)
-- Mirror the pattern from quality_findings in migration 011
-- ──────────────────────────────────────────────────────────────
ALTER TABLE cfdi_extractions ENABLE ROW LEVEL SECURITY;

-- Service role (Jarvis / server-side) can read and write everything
CREATE POLICY "service_role_all" ON cfdi_extractions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users (Mario / ops) can read
CREATE POLICY "authenticated_read" ON cfdi_extractions
  FOR SELECT
  TO authenticated
  USING (true);

-- ──────────────────────────────────────────────────────────────
-- Comment
-- ──────────────────────────────────────────────────────────────
COMMENT ON TABLE cfdi_extractions IS
  'Stores CFDI QR extraction results and SAT verification for talon/paystub documents. '
  'One row per extraction attempt. Used for duplicate UUID detection and audit trail.';
