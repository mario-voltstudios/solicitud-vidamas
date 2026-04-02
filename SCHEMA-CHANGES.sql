-- ============================================================
-- SCHEMA CHANGES — Run in Supabase SQL Editor
-- Generated: 2026-04-02
-- Feature: magic token auth + IMSS jubilado segmentation
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Magic Token Auth (agent unique URLs)
-- ──────────────────────────────────────────────────────────────

-- Add magic_token columns to agentes table
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS magic_token TEXT UNIQUE;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS magic_token_created_at TIMESTAMPTZ DEFAULT NOW();

-- Index for fast token lookup
CREATE UNIQUE INDEX IF NOT EXISTS agentes_magic_token_idx ON agentes(magic_token);

-- ──────────────────────────────────────────────────────────────
-- 2. IMSS Jubilado/Activo Segmentation
-- ──────────────────────────────────────────────────────────────

-- Add imss_tipo column to solicitudes table
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS imss_tipo TEXT CHECK (imss_tipo IN ('ACTIVO', 'JUBILADO'));

-- Backfill from existing data using dependencia field:
-- (These are safe to run multiple times — only updates rows where imss_tipo IS NULL)
UPDATE solicitudes SET imss_tipo = 'ACTIVO'
  WHERE dependencia ILIKE '%IMSS%' AND dependencia NOT ILIKE '%JUBILADO%' AND imss_tipo IS NULL;

UPDATE solicitudes SET imss_tipo = 'JUBILADO'
  WHERE dependencia ILIKE '%JUBILADO%' AND imss_tipo IS NULL;
