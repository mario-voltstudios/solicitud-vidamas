-- ============================================================
-- VidaMás — Phase 1 Truth Layer
-- 009_recibos_backfill_columns.sql
--
-- PURPOSE:
--   Add columns to `recibos` needed to backfill from Airtable
--   `Recibos Prospera` without data loss.
--   These columns are identified in docs/airtable-operational-table-triage-2026-03-15.md.
--
-- BACKFILL RULE:
--   After adding columns, run the Airtable ETL to load
--   Recibos Prospera rows into this table.
--   DO NOT create a second table — merge into canonical `recibos`.
--
-- NOTE ON RECEIPTS / RECIBOS SYNC:
--   There are currently two parallel sources of collection data:
--     1. ASTRO.public.receipts — imported from GNP export files
--     2. solicitud-vidamas.public.recibos — lifecycle table (currently empty)
--   These need to be unified. The ASTRO receipts table should
--   become input to the recibos lifecycle table, not a substitute.
--   Sync pipeline design is deferred to Phase 2.
-- ============================================================

-- Columns needed for Airtable Recibos Prospera backfill
ALTER TABLE recibos
  ADD COLUMN IF NOT EXISTS contratante_nombre text,
  ADD COLUMN IF NOT EXISTS agente_clave       text,
  ADD COLUMN IF NOT EXISTS plan               text,
  ADD COLUMN IF NOT EXISTS periodicidad       text,
  ADD COLUMN IF NOT EXISTS metodo_pago        text,
  ADD COLUMN IF NOT EXISTS tipo_cobro         text,
  ADD COLUMN IF NOT EXISTS ref_externa        text,   -- ID externo recibo from Airtable
  ADD COLUMN IF NOT EXISTS num_recibo         text;   -- Número de recibo

-- Index for agent-based queries
CREATE INDEX IF NOT EXISTS idx_recibos_agente
  ON recibos(agente_clave)
  WHERE agente_clave IS NOT NULL;

COMMENT ON COLUMN recibos.agente_clave IS
  'Agent who owns this policy. Denormalized from polizas → solicitudes.clave_agente '
  'for query convenience. Also populated during Airtable backfill.';

COMMENT ON COLUMN recibos.ref_externa IS
  'External reference ID (e.g. Airtable record ID or GNP transaction ID). '
  'Used for idempotent upserts during backfill.';
