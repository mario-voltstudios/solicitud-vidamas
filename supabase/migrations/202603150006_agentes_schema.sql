-- ============================================================
-- VidaMás — Phase 2A Schema Migration
-- 006_agentes_schema.sql
-- ============================================================
-- PURPOSE:
--   Formalize the `agentes` table schema that already exists
--   in production and is referenced by actions.ts:
--     validateAgente() → selects id, clave, nombre_completo,
--                        nombre_corto, status
--
--   This migration:
--     1. Creates the table IF NOT EXISTS (safe no-op if already
--        present with the expected columns)
--     2. Adds missing columns with IF NOT EXISTS guards
--     3. Adds indexes for common query patterns
--     4. Documents the canonical schema in comments
--
-- WHAT WAS INFERRED FROM CODE:
--   actions.ts queries: id, clave, nombre_completo,
--                       nombre_corto, status
--   From domain context: clave is unique agent key used in
--                        folio generation and Airtable writes.
--   From GAP_ANALYSIS:   agentes also has gerencia, oficina,
--                        comision_band, fecha_ingreso fields
--                        (documented but not confirmed in code).
-- ============================================================

-- ----------------------------------------------------------
-- 1. Create table (no-op if already exists)
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS agentes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identity (used by actions.ts validateAgente)
  clave             text        NOT NULL UNIQUE,    -- e.g. "JGLS", "MPU01"
  nombre_completo   text        NOT NULL,           -- full legal name
  nombre_corto      text,                           -- short display name / alias

  -- Status lifecycle
  -- active → inactive | suspended
  status            text        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'inactive', 'suspended')),

  -- Organizational hierarchy
  gerencia          text,        -- regional management unit
  oficina           text,        -- office/branch name
  nivel             text,        -- seniority / tier (e.g. 'junior', 'senior', 'gerente')

  -- Commission
  banda_comision    text,        -- commission band identifier (FK to bandas_comisiones future)
  porcentaje_comision numeric(5,2), -- override %, NULL = use banda_comision default

  -- Contact / identity
  email             text,
  telefono          text,
  rfc               text,
  curp              text,

  -- Employment dates
  fecha_ingreso     date,
  fecha_baja        date,        -- NULL if still active

  -- Metadata
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- 2. Add columns that may be missing on existing production
--    tables (all use IF NOT EXISTS — safe no-op if present)
-- ----------------------------------------------------------

ALTER TABLE agentes
  ADD COLUMN IF NOT EXISTS gerencia           text,
  ADD COLUMN IF NOT EXISTS oficina            text,
  ADD COLUMN IF NOT EXISTS nivel              text,
  ADD COLUMN IF NOT EXISTS banda_comision     text,
  ADD COLUMN IF NOT EXISTS porcentaje_comision numeric(5,2),
  ADD COLUMN IF NOT EXISTS email              text,
  ADD COLUMN IF NOT EXISTS telefono           text,
  ADD COLUMN IF NOT EXISTS rfc                text,
  ADD COLUMN IF NOT EXISTS curp               text,
  ADD COLUMN IF NOT EXISTS fecha_ingreso      date,
  ADD COLUMN IF NOT EXISTS fecha_baja         date,
  ADD COLUMN IF NOT EXISTS notas              text,
  ADD COLUMN IF NOT EXISTS created_at         timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

-- ----------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_agentes_clave
  ON agentes(clave);

CREATE INDEX IF NOT EXISTS idx_agentes_status
  ON agentes(status);

CREATE INDEX IF NOT EXISTS idx_agentes_gerencia
  ON agentes(gerencia)
  WHERE gerencia IS NOT NULL;

-- ----------------------------------------------------------
-- 4. updated_at trigger
-- ----------------------------------------------------------

DROP TRIGGER IF EXISTS trg_agentes_updated_at ON agentes;
CREATE TRIGGER trg_agentes_updated_at
  BEFORE UPDATE ON agentes
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
  -- Note: trg_set_updated_at() is defined in 004_solicitud_documentos.sql
  -- If running this file standalone, create it first:
  -- CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
  -- BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ----------------------------------------------------------
-- 5. View: active agents summary (used by agent selector UI)
-- ----------------------------------------------------------

CREATE OR REPLACE VIEW v_agentes_activos AS
SELECT
  id,
  clave,
  nombre_completo,
  nombre_corto,
  gerencia,
  oficina,
  nivel,
  banda_comision,
  email,
  telefono,
  fecha_ingreso
FROM agentes
WHERE status = 'active'
ORDER BY nombre_completo;

COMMENT ON VIEW v_agentes_activos IS
  'Active agents for dropdown/validation UI. Excludes inactive and suspended.';

-- ----------------------------------------------------------
-- 6. Schema documentation comments
-- ----------------------------------------------------------

COMMENT ON TABLE agentes IS
  'Agent directory. Referenced by solicitudes.clave_agente (text FK). '
  'The clave column is the canonical join key used throughout the system.';

COMMENT ON COLUMN agentes.clave IS
  'Unique agent identifier used in folio generation: {clave}-{year}-S{week}-{n}. '
  'Also written to Airtable as "Clave Agente". Must match exactly.';

COMMENT ON COLUMN agentes.banda_comision IS
  'Commission band identifier. Points logically to a future bandas_comisiones table. '
  'NULL if agent uses a direct override (porcentaje_comision).';

COMMENT ON COLUMN agentes.status IS
  'active = can submit new solicitudes. '
  'inactive = no longer operating, historical records preserved. '
  'suspended = temporarily blocked (compliance, debt, etc.).';
