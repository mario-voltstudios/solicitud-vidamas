-- ============================================================
-- VidaMás — Intake V2 OCR Persistence Contract
-- 015_ocr_persistence_contract.sql
-- ============================================================
-- PURPOSE:
--   Add an explicit, structured OCR persistence contract on top
--   of existing solicitud_documentos OCR lifecycle fields.
--
-- ADDITIVE ONLY:
--   Existing columns from 004_solicitud_documentos.sql are kept:
--   ocr_state, ocr_at, ocr_data, ocr_raw, ocr_error, ocr_confidence.
--   This migration adds v2 payload/error/provider metadata columns
--   so API results from /api/ocr/extract can be saved without
--   changing the existing submission path.
-- ============================================================

ALTER TABLE solicitud_documentos
  ADD COLUMN IF NOT EXISTS ocr_payload jsonb,
  ADD COLUMN IF NOT EXISTS ocr_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ocr_provider text,
  ADD COLUMN IF NOT EXISTS ocr_model text,
  ADD COLUMN IF NOT EXISTS ocr_document_type text,
  ADD COLUMN IF NOT EXISTS ocr_processed_at timestamptz;

COMMENT ON COLUMN solicitud_documentos.ocr_payload IS
  'Structured OCR result payload returned by the Intake V2 OCR endpoint (talon/ine extraction).';

COMMENT ON COLUMN solicitud_documentos.ocr_errors IS
  'Structured OCR validation/provider errors as JSON array. Empty array means no known OCR errors.';

COMMENT ON COLUMN solicitud_documentos.ocr_provider IS
  'OCR provider name, e.g. openai.';

COMMENT ON COLUMN solicitud_documentos.ocr_model IS
  'OCR model identifier used by provider, when known.';

COMMENT ON COLUMN solicitud_documentos.ocr_document_type IS
  'Normalized OCR document type: talon or ine.';

COMMENT ON COLUMN solicitud_documentos.ocr_processed_at IS
  'Timestamp when OCR payload/error state was last persisted.';

CREATE INDEX IF NOT EXISTS idx_sol_docs_ocr_document_type
  ON solicitud_documentos(ocr_document_type)
  WHERE ocr_document_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sol_docs_ocr_processed_at
  ON solicitud_documentos(ocr_processed_at)
  WHERE ocr_processed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sol_docs_ocr_errors_nonempty
  ON solicitud_documentos USING gin (ocr_errors)
  WHERE jsonb_array_length(ocr_errors) > 0;
