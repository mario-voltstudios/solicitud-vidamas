-- ============================================================
-- VidaMás — Phase 1 Schema Migration
-- 002_poliza_reconciliation.sql
-- ============================================================
-- PURPOSE:
--   Add the polizas table with a link back to the originating
--   solicitud, plus a reconciliation_checks table that records
--   the role-by-role cross-check performed after emission.
--
-- BUSINESS RULE:
--   After emission, the póliza issued by GNP must be cross-
--   checked against the original solicitud:
--     - Contratante name/RFC matches
--     - Asegurado name/RFC matches
--     - Plan / prima / suma asegurada matches
--     - All beneficiarios and their porcentajes match
--   Any discrepancy must be flagged for Paso 2 correction.
-- ============================================================

-- ----------------------------------------------------------
-- 1. polizas — one row per emitted policy
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS polizas (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id        uuid        NOT NULL REFERENCES solicitudes(id),

  -- GNP-assigned identifiers
  num_poliza          text        UNIQUE,       -- e.g. "GNP-12345678"
  num_certificado     text,                     -- certificate number within group policy

  -- Emission metadata
  fecha_emision       date,
  fecha_vigencia_ini  date,
  fecha_vigencia_fin  date,
  emisor_clave        text,                     -- clave_agente who triggered emission

  -- Status lifecycle
  -- pendiente_emision → emitida → vigente → cancelada | caducada
  status              text        NOT NULL DEFAULT 'pendiente_emision'
                        CHECK (status IN (
                          'pendiente_emision',
                          'emitida',
                          'vigente',
                          'cancelada',
                          'caducada'
                        )),

  -- What GNP actually recorded (may differ from solicitud if correction needed)
  gnp_contratante_nombre  text,
  gnp_contratante_rfc     text,
  gnp_asegurado_nombre    text,
  gnp_asegurado_rfc       text,
  gnp_plan                text,
  gnp_prima_mensual       numeric(10,2),
  gnp_suma_asegurada      numeric(12,2),
  gnp_beneficiarios       jsonb,               -- raw from GNP PDF/portal

  -- Paso 2 tracking
  paso2_completado    boolean     DEFAULT false,
  paso2_fecha         timestamptz,
  paso2_usuario       text,

  -- Paso 2.5 tracking
  paso25_verificado   boolean     DEFAULT false,
  paso25_fecha        timestamptz,
  paso25_notas        text,

  -- Audit
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_polizas_solicitud_id ON polizas(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_polizas_num_poliza   ON polizas(num_poliza);
CREATE INDEX IF NOT EXISTS idx_polizas_status       ON polizas(status);
CREATE INDEX IF NOT EXISTS idx_polizas_paso2        ON polizas(paso2_completado) WHERE NOT paso2_completado;

COMMENT ON TABLE polizas IS
  'One row per GNP-emitted policy. Created from a solicitud by the emisor bot. '
  'After emission, reconciliation_checks records the role-by-role cross-check.';

COMMENT ON COLUMN polizas.gnp_beneficiarios IS
  'Raw beneficiarios as recorded by GNP. Compared against solicitud_beneficiarios '
  'during reconciliation to detect discrepancies.';

-- ----------------------------------------------------------
-- 2. reconciliation_checks — post-emission cross-check log
-- ----------------------------------------------------------
-- Records the outcome of comparing poliza against solicitud
-- for each required field/entity. One row per check item.
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS reconciliation_checks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id       uuid        NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
  solicitud_id    uuid        NOT NULL REFERENCES solicitudes(id),

  -- What was checked
  check_category  text        NOT NULL,   -- 'contratante' | 'asegurado' | 'plan' | 'beneficiario'
  check_field     text        NOT NULL,   -- e.g. 'nombre', 'rfc', 'porcentaje'
  beneficiario_idx int,                   -- index within beneficiarios list (NULL for non-beneficiario checks)

  -- Result
  status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('ok', 'discrepancy', 'missing', 'pending')),
  solicitud_value text,
  poliza_value    text,
  notes           text,

  -- Who/when
  checked_by      text,                  -- user or 'auto'
  checked_at      timestamptz DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     text
);

CREATE INDEX IF NOT EXISTS idx_recon_poliza_id  ON reconciliation_checks(poliza_id);
CREATE INDEX IF NOT EXISTS idx_recon_status     ON reconciliation_checks(status) WHERE status != 'ok';

COMMENT ON TABLE reconciliation_checks IS
  'Post-emission cross-check log. Each row is one field comparison '
  'between what the solicitud specified and what GNP actually emitted. '
  'Discrepancies drive Paso 2 correction.';

-- ----------------------------------------------------------
-- 3. View: v_polizas_pending_reconciliation
-- ----------------------------------------------------------
-- Shows polizas that are emitted but not yet fully reconciled.
-- Useful for daily Paso 2 queue.
-- ----------------------------------------------------------

CREATE OR REPLACE VIEW v_polizas_pending_reconciliation AS
SELECT
  p.id                        AS poliza_id,
  p.num_poliza,
  p.solicitud_id,
  s.folio,
  s.clave_agente,
  s.contratante_nombres       || ' ' || COALESCE(s.contratante_ap_paterno,'')
                              AS contratante_nombre,
  p.fecha_emision,
  p.paso2_completado,
  p.paso25_verificado,
  p.status                    AS poliza_status,
  -- Count discrepancies
  COUNT(rc.id) FILTER (WHERE rc.status = 'discrepancy') AS discrepancias,
  COUNT(rc.id) FILTER (WHERE rc.status = 'pending')     AS pendientes_revision,
  -- Paso 2 SLA: must be done within 6 hours of emission
  CASE
    WHEN p.fecha_emision IS NOT NULL AND NOT p.paso2_completado
    THEN EXTRACT(epoch FROM (now() - p.created_at)) / 3600.0
    ELSE NULL
  END                         AS horas_desde_emision
FROM polizas p
JOIN solicitudes s ON s.id = p.solicitud_id
LEFT JOIN reconciliation_checks rc ON rc.poliza_id = p.id
WHERE p.status = 'emitida'
  AND NOT p.paso2_completado
GROUP BY p.id, s.folio, s.clave_agente, s.contratante_nombres,
         s.contratante_ap_paterno, p.fecha_emision,
         p.paso2_completado, p.paso25_verificado, p.status, p.created_at;

COMMENT ON VIEW v_polizas_pending_reconciliation IS
  'Daily Paso 2 queue — emitted policies awaiting document correction and reconciliation.';

-- ----------------------------------------------------------
-- 4. Helper function: auto-generate reconciliation rows
-- ----------------------------------------------------------
-- Call after inserting a poliza to create the standard set
-- of pending check rows for the emisor bot to fill in.
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_create_reconciliation_checks(p_poliza_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_solicitud_id uuid;
  v_beneficiario_count int;
BEGIN
  SELECT solicitud_id INTO v_solicitud_id FROM polizas WHERE id = p_poliza_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Poliza % not found', p_poliza_id;
  END IF;

  -- Contratante checks
  INSERT INTO reconciliation_checks (poliza_id, solicitud_id, check_category, check_field, status)
  VALUES
    (p_poliza_id, v_solicitud_id, 'contratante', 'nombre',    'pending'),
    (p_poliza_id, v_solicitud_id, 'contratante', 'rfc',       'pending'),
    (p_poliza_id, v_solicitud_id, 'contratante', 'curp',      'pending'),
    (p_poliza_id, v_solicitud_id, 'contratante', 'fecha_nac', 'pending');

  -- Asegurado checks
  INSERT INTO reconciliation_checks (poliza_id, solicitud_id, check_category, check_field, status)
  VALUES
    (p_poliza_id, v_solicitud_id, 'asegurado', 'nombre',    'pending'),
    (p_poliza_id, v_solicitud_id, 'asegurado', 'rfc',       'pending'),
    (p_poliza_id, v_solicitud_id, 'asegurado', 'fecha_nac', 'pending');

  -- Plan checks
  INSERT INTO reconciliation_checks (poliza_id, solicitud_id, check_category, check_field, status)
  VALUES
    (p_poliza_id, v_solicitud_id, 'plan', 'plan',           'pending'),
    (p_poliza_id, v_solicitud_id, 'plan', 'prima_mensual',  'pending'),
    (p_poliza_id, v_solicitud_id, 'plan', 'suma_asegurada', 'pending');

  -- Beneficiario checks (one row per beneficiario)
  SELECT COUNT(*) INTO v_beneficiario_count
  FROM solicitud_beneficiarios WHERE solicitud_id = v_solicitud_id;

  FOR i IN 0..(v_beneficiario_count - 1) LOOP
    INSERT INTO reconciliation_checks (poliza_id, solicitud_id, check_category, check_field, beneficiario_idx, status)
    VALUES
      (p_poliza_id, v_solicitud_id, 'beneficiario', 'nombre',     i, 'pending'),
      (p_poliza_id, v_solicitud_id, 'beneficiario', 'parentesco', i, 'pending'),
      (p_poliza_id, v_solicitud_id, 'beneficiario', 'porcentaje', i, 'pending');
  END LOOP;
END;
$$;

COMMENT ON FUNCTION fn_create_reconciliation_checks IS
  'Creates the standard set of pending reconciliation_checks rows for a newly '
  'emitted poliza. Call once after inserting the poliza row.';
