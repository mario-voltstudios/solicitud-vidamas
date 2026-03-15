-- ============================================================
-- VidaMás — Phase 1 Schema Migration
-- 003_recibos_lifecycle.sql
-- ============================================================
-- PURPOSE:
--   Define the recibos table as a proper lifecycle/history
--   model. Key design decisions:
--
--   1. HISTORY ROWS — A recibo is NOT a unique-by-date record.
--      Multiple rows may exist for the same poliza + period
--      (e.g., original Cancelado + replacement Pendiente/Liquidado).
--
--   2. STATUSES:
--        Pendiente  — created, awaiting payment/collection
--        Liquidado  — collected/paid
--        Cancelado  — cancelled (grace period exceeded)
--
--   3. GRACE PERIOD (~90-120 days):
--      If a recibo is unpaid past ~90-120 days it may become
--      Cancelado by the system or GNP.
--
--   4. REPLACEMENT LINEAGE:
--      If a policy is reinstated (~270 day window), a new
--      Pendiente/Liquidado recibo is created for the same
--      period/date. The older Cancelado row is preserved.
--      Track lineage via replaced_recibo_id.
--
--   5. REPORTING:
--      Status-aware views allow "current balance per period"
--      queries that correctly treat Cancelado as superseded
--      when a replacement row exists.
-- ============================================================

-- ----------------------------------------------------------
-- 1. recibos — lifecycle history table
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS recibos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id           uuid        NOT NULL REFERENCES polizas(id),

  -- Period identification
  -- Combination of (poliza_id + periodo_fecha) is NOT unique — see note above
  periodo_fecha       date        NOT NULL,   -- first day of the billing period
  periodo_label       text,                   -- e.g. "Enero 2026" for display

  -- Amounts
  monto               numeric(10,2) NOT NULL,
  monto_liquidado     numeric(10,2),          -- actual amount received (may differ)

  -- Status lifecycle
  status              text        NOT NULL DEFAULT 'Pendiente'
                        CHECK (status IN ('Pendiente', 'Liquidado', 'Cancelado')),
  fecha_liquidacion   date,                   -- when payment was confirmed
  fecha_cancelacion   date,                   -- when cancelled
  motivo_cancelacion  text,                   -- reason for cancellation

  -- Replacement lineage
  -- When a reinstated policy creates a new recibo for the same period,
  -- this column links back to the original (now Cancelado) row.
  replaced_recibo_id  uuid        REFERENCES recibos(id),

  -- Generation (1 = original, 2 = first replacement, etc.)
  generacion          int         NOT NULL DEFAULT 1,

  -- Source info
  fuente              text,                   -- 'gnp_sync' | 'manual' | 'sistema'
  referencia_gnp      text,                   -- GNP receipt/reference number

  -- Audit
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_poliza_id     ON recibos(poliza_id);
CREATE INDEX IF NOT EXISTS idx_recibos_periodo       ON recibos(poliza_id, periodo_fecha);
CREATE INDEX IF NOT EXISTS idx_recibos_status        ON recibos(status);
CREATE INDEX IF NOT EXISTS idx_recibos_pendiente     ON recibos(poliza_id, periodo_fecha) WHERE status = 'Pendiente';
CREATE INDEX IF NOT EXISTS idx_recibos_lineage       ON recibos(replaced_recibo_id) WHERE replaced_recibo_id IS NOT NULL;

COMMENT ON TABLE recibos IS
  'Lifecycle history table for policy premium receipts. '
  'NOT unique by (poliza_id, periodo_fecha) — multiple rows per period are allowed '
  'to represent cancellation + reinstatement history. '
  'Always query with status awareness.';

COMMENT ON COLUMN recibos.replaced_recibo_id IS
  'When a reinstated policy creates a replacement recibo for the same period, '
  'this points to the older (Cancelado) row it supersedes.';

COMMENT ON COLUMN recibos.generacion IS
  '1 = original recibo, 2 = first replacement after reinstatement, etc.';

-- ----------------------------------------------------------
-- 2. View: v_recibos_current
-- ----------------------------------------------------------
-- "Current" view of recibos: for each (poliza_id, periodo_fecha)
-- returns only the most recent non-cancelled row, or if all
-- rows are cancelled, the most recent cancelled row.
-- Use for balance/collection reports.
-- ----------------------------------------------------------

CREATE OR REPLACE VIEW v_recibos_current AS
WITH ranked AS (
  SELECT
    r.*,
    ROW_NUMBER() OVER (
      PARTITION BY r.poliza_id, r.periodo_fecha
      ORDER BY
        -- Active rows first, then by generation desc
        CASE r.status WHEN 'Liquidado' THEN 0 WHEN 'Pendiente' THEN 1 ELSE 2 END,
        r.generacion DESC,
        r.created_at DESC
    ) AS rn
  FROM recibos r
)
SELECT
  id, poliza_id, periodo_fecha, periodo_label,
  monto, monto_liquidado,
  status, fecha_liquidacion, fecha_cancelacion, motivo_cancelacion,
  replaced_recibo_id, generacion, fuente, referencia_gnp,
  created_at, updated_at
FROM ranked
WHERE rn = 1;

COMMENT ON VIEW v_recibos_current IS
  'Returns the "current" (most relevant) recibo per (poliza_id, periodo_fecha). '
  'For each period: prefers Liquidado > Pendiente > Cancelado, then highest generation. '
  'Use for balance sheets and collection reports.';

-- ----------------------------------------------------------
-- 3. View: v_recibos_cobranza_resumen
-- ----------------------------------------------------------
-- Summary of collection status per policy.
-- Shows counts and totals by status for dashboard use.
-- ----------------------------------------------------------

CREATE OR REPLACE VIEW v_recibos_cobranza_resumen AS
SELECT
  p.num_poliza,
  p.id                                                    AS poliza_id,
  s.folio,
  s.clave_agente,
  s.contratante_nombres || ' ' || COALESCE(s.contratante_ap_paterno,'')
                                                          AS contratante,
  s.contratante_dependencia,
  -- Counts from current view
  COUNT(rc.id)                                            AS total_periodos,
  COUNT(rc.id) FILTER (WHERE rc.status = 'Pendiente')     AS pendientes,
  COUNT(rc.id) FILTER (WHERE rc.status = 'Liquidado')     AS liquidados,
  COUNT(rc.id) FILTER (WHERE rc.status = 'Cancelado')     AS cancelados,
  -- Amounts
  COALESCE(SUM(rc.monto) FILTER (WHERE rc.status = 'Pendiente'),    0) AS monto_pendiente,
  COALESCE(SUM(rc.monto_liquidado) FILTER (WHERE rc.status = 'Liquidado'), 0) AS monto_cobrado
FROM polizas p
JOIN solicitudes s   ON s.id = p.solicitud_id
LEFT JOIN v_recibos_current rc ON rc.poliza_id = p.id
GROUP BY p.num_poliza, p.id, s.folio, s.clave_agente,
         s.contratante_nombres, s.contratante_ap_paterno,
         s.contratante_dependencia;

COMMENT ON VIEW v_recibos_cobranza_resumen IS
  'Collection dashboard summary per policy. Uses v_recibos_current so Cancelado '
  'periods with active replacements are counted correctly.';

-- ----------------------------------------------------------
-- 4. View: v_recibos_all_history
-- ----------------------------------------------------------
-- Full history including superseded rows, for audit trail.
-- ----------------------------------------------------------

CREATE OR REPLACE VIEW v_recibos_all_history AS
SELECT
  r.*,
  p.num_poliza,
  s.folio,
  s.clave_agente,
  -- Is this row superseded by a replacement?
  EXISTS (
    SELECT 1 FROM recibos r2
    WHERE r2.replaced_recibo_id = r.id
  )                                                       AS superseded_by_replacement
FROM recibos r
JOIN polizas p     ON p.id = r.poliza_id
JOIN solicitudes s ON s.id = p.solicitud_id;

COMMENT ON VIEW v_recibos_all_history IS
  'Full recibo audit trail including superseded rows. '
  'Use superseded_by_replacement = true to identify Cancelado rows '
  'that have been replaced by a reinstatement recibo.';

-- ----------------------------------------------------------
-- 5. Helper: fn_create_replacement_recibo
-- ----------------------------------------------------------
-- Creates a new Pendiente recibo for a period that was
-- previously Cancelado (reinstatement case).
-- Marks the old row as superseded via replaced_recibo_id.
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_create_replacement_recibo(
  p_cancelled_recibo_id  uuid,
  p_monto                numeric(10,2),
  p_fuente               text DEFAULT 'sistema',
  p_referencia_gnp       text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_old      recibos%ROWTYPE;
  v_new_id   uuid;
BEGIN
  SELECT * INTO v_old FROM recibos WHERE id = p_cancelled_recibo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recibo % not found', p_cancelled_recibo_id;
  END IF;

  IF v_old.status != 'Cancelado' THEN
    RAISE EXCEPTION 'Recibo % status is %, expected Cancelado', p_cancelled_recibo_id, v_old.status;
  END IF;

  INSERT INTO recibos (
    poliza_id, periodo_fecha, periodo_label,
    monto, status,
    replaced_recibo_id, generacion,
    fuente, referencia_gnp
  ) VALUES (
    v_old.poliza_id, v_old.periodo_fecha, v_old.periodo_label,
    p_monto, 'Pendiente',
    p_cancelled_recibo_id, v_old.generacion + 1,
    p_fuente, p_referencia_gnp
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION fn_create_replacement_recibo IS
  'Reinstates a cancelled period by creating a new Pendiente recibo linked back '
  'to the original Cancelado row. The old row is preserved for audit history.';
