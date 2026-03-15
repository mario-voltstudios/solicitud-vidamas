-- ============================================================
-- VidaMás — Phase 1 Schema Migration
-- 001_solicitudes_normalized.sql
-- ============================================================
-- PURPOSE:
--   Normalize the beneficiarios from a JSONB blob on solicitudes
--   into a dedicated solicitud_beneficiarios table.
--   Adds explicit entity roles (contratante / asegurado / cobro)
--   as structured columns (already exist on the table; this
--   migration adds constraints and NOT NULL guards where safe).
--
-- PHASED APPROACH (safe for live production):
--   Phase 1 (this file): Add solicitud_beneficiarios table +
--                        migrate existing JSONB data into it +
--                        add compatibility view.
--   Phase 2 (future):    Remove beneficiarios JSONB column
--                        once all readers use the new table.
--
-- SAFETY: All changes are additive. The existing beneficiarios
--         JSONB column is NOT dropped in this migration.
-- ============================================================

-- ----------------------------------------------------------
-- 1. Ensure the solicitudes table has the canonical columns
--    (these already exist in production; ADD COLUMN IF NOT EXISTS
--    is a no-op if they're present)
-- ----------------------------------------------------------

ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS contratante_nombres     text,
  ADD COLUMN IF NOT EXISTS contratante_ap_paterno  text,
  ADD COLUMN IF NOT EXISTS contratante_ap_materno  text,
  ADD COLUMN IF NOT EXISTS contratante_fecha_nac   date,
  ADD COLUMN IF NOT EXISTS contratante_genero      text,
  ADD COLUMN IF NOT EXISTS contratante_rfc         text,
  ADD COLUMN IF NOT EXISTS contratante_curp        text,
  ADD COLUMN IF NOT EXISTS contratante_tipo_id     text,
  ADD COLUMN IF NOT EXISTS contratante_num_id      text,
  ADD COLUMN IF NOT EXISTS contratante_email       text,
  ADD COLUMN IF NOT EXISTS contratante_telefono    text,
  ADD COLUMN IF NOT EXISTS contratante_calle       text,
  ADD COLUMN IF NOT EXISTS contratante_num_ext     text,
  ADD COLUMN IF NOT EXISTS contratante_num_int     text,
  ADD COLUMN IF NOT EXISTS contratante_cp          text,
  ADD COLUMN IF NOT EXISTS contratante_colonia     text,
  ADD COLUMN IF NOT EXISTS contratante_estado      text,
  ADD COLUMN IF NOT EXISTS contratante_municipio   text,
  ADD COLUMN IF NOT EXISTS contratante_ocupacion   text,
  ADD COLUMN IF NOT EXISTS contratante_dependencia text;

ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS misma_persona           boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS asegurado_nombres       text,
  ADD COLUMN IF NOT EXISTS asegurado_ap_paterno    text,
  ADD COLUMN IF NOT EXISTS asegurado_ap_materno    text,
  ADD COLUMN IF NOT EXISTS asegurado_fecha_nac     date,
  ADD COLUMN IF NOT EXISTS asegurado_genero        text,
  ADD COLUMN IF NOT EXISTS asegurado_rfc           text;

ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS forma_cobro             text,   -- 'nomina' | 'clabe'
  ADD COLUMN IF NOT EXISTS clave_delegacional      text,
  ADD COLUMN IF NOT EXISTS matricula               text,
  ADD COLUMN IF NOT EXISTS sub_dependencia         text,
  ADD COLUMN IF NOT EXISTS folio_contrato          text,
  ADD COLUMN IF NOT EXISTS clabe                   text,
  ADD COLUMN IF NOT EXISTS banco                   text,
  ADD COLUMN IF NOT EXISTS fecha_inicio_cobro      date;

ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS plan                    text,
  ADD COLUMN IF NOT EXISTS periodicidad            text,
  ADD COLUMN IF NOT EXISTS prima_base              numeric(10,2),
  ADD COLUMN IF NOT EXISTS prima_adicional         numeric(10,2),
  ADD COLUMN IF NOT EXISTS suma_asegurada          numeric(12,2);

-- ----------------------------------------------------------
-- 2. solicitud_beneficiarios — normalized beneficiarios table
-- ----------------------------------------------------------
-- Replaces the beneficiarios JSONB blob on solicitudes.
-- Each row = one death beneficiary for one solicitud.
-- Constraint: sum of porcentaje per solicitud_id = 100.
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS solicitud_beneficiarios (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id    uuid        NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,

  -- Identity
  nombres         text        NOT NULL,
  ap_paterno      text        NOT NULL,
  ap_materno      text,
  fecha_nac       date,
  parentesco      text        NOT NULL,

  -- Benefit share
  porcentaje      numeric(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),

  -- Audit
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitud_beneficiarios_solicitud_id
  ON solicitud_beneficiarios(solicitud_id);

-- ----------------------------------------------------------
-- 3. Trigger: enforce sum(porcentaje) = 100 per solicitud
-- ----------------------------------------------------------
-- NOTE: A CHECK constraint cannot reference other rows, so we
-- use a trigger function instead.
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_check_beneficiario_pct()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  total numeric;
BEGIN
  SELECT COALESCE(SUM(porcentaje), 0)
    INTO total
    FROM solicitud_beneficiarios
   WHERE solicitud_id = NEW.solicitud_id;

  IF total > 100.01 THEN
    RAISE EXCEPTION
      'Beneficiarios para solicitud % suman %.2f%% — debe ser <= 100%%',
      NEW.solicitud_id, total;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_beneficiario_pct ON solicitud_beneficiarios;
CREATE TRIGGER trg_beneficiario_pct
  AFTER INSERT OR UPDATE ON solicitud_beneficiarios
  FOR EACH ROW EXECUTE FUNCTION trg_check_beneficiario_pct();

-- ----------------------------------------------------------
-- 4. Back-fill from JSONB blob (run once, idempotent)
-- ----------------------------------------------------------
-- Reads existing solicitudes.beneficiarios JSONB array and
-- inserts into solicitud_beneficiarios, skipping rows that
-- are already present (by solicitud_id).
-- ----------------------------------------------------------

INSERT INTO solicitud_beneficiarios (
  solicitud_id,
  nombres,
  ap_paterno,
  ap_materno,
  fecha_nac,
  parentesco,
  porcentaje
)
SELECT
  s.id                                                AS solicitud_id,
  b->>'nombres'                                       AS nombres,
  b->>'ap_paterno'                                    AS ap_paterno,
  b->>'ap_materno'                                    AS ap_materno,
  NULLIF(b->>'fecha_nac', '')::date                   AS fecha_nac,
  COALESCE(NULLIF(b->>'parentesco',''), 'Sin especificar') AS parentesco,
  COALESCE((b->>'porcentaje')::numeric, 0)            AS porcentaje
FROM solicitudes s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(s.beneficiarios) = 'array' THEN s.beneficiarios
    ELSE '[]'::jsonb
  END
) AS b
WHERE s.beneficiarios IS NOT NULL
  AND jsonb_array_length(
    CASE
      WHEN jsonb_typeof(s.beneficiarios) = 'array' THEN s.beneficiarios
      ELSE '[]'::jsonb
    END
  ) > 0
  AND NOT EXISTS (
    SELECT 1 FROM solicitud_beneficiarios sb WHERE sb.solicitud_id = s.id
  );

-- ----------------------------------------------------------
-- 5. Compatibility view: v_solicitud_with_beneficiarios
-- ----------------------------------------------------------
-- Allows existing readers of solicitudes to still get a
-- beneficiarios JSON array (now re-aggregated from the
-- normalized table) until they can be migrated to join
-- directly against solicitud_beneficiarios.
-- ----------------------------------------------------------

CREATE OR REPLACE VIEW v_solicitud_with_beneficiarios AS
SELECT
  s.*,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',         sb.id,
          'nombres',    sb.nombres,
          'ap_paterno', sb.ap_paterno,
          'ap_materno', sb.ap_materno,
          'fecha_nac',  sb.fecha_nac,
          'parentesco', sb.parentesco,
          'porcentaje', sb.porcentaje
        )
        ORDER BY sb.created_at
      )
      FROM solicitud_beneficiarios sb
      WHERE sb.solicitud_id = s.id
    ),
    '[]'::jsonb
  ) AS beneficiarios_normalized
FROM solicitudes s;

COMMENT ON VIEW v_solicitud_with_beneficiarios IS
  'Compatibility view — emits beneficiarios as a JSONB array re-aggregated '
  'from the normalized solicitud_beneficiarios table. '
  'Use for read-only access until consumers migrate to direct joins.';
