-- ============================================================
-- VidaMás — Phase 2A Schema Migration
-- 005_solicitud_status_history.sql
-- ============================================================
-- PURPOSE:
--   Append-only audit log of every status transition on a
--   solicitud. The `solicitudes.status` column remains the
--   current state; this table is the immutable history.
--
-- STATUS FLOW (canonical):
--   pendiente
--     → en_revision        (agent or ops reviewing)
--     → en_emision         (being submitted to GNP portal)
--     → emitida            (póliza created, before Paso 2)
--     → completada         (Paso 2 done, reconciled)
--     → rechazada          (GNP rejected, or agent cancelled pre-emission)
--     → pendiente          (re-opened after rejection / correction)
--
-- ACTORS:
--   actor_type:  'agente' | 'ops' | 'system' | 'emisor_bot'
--   actor_id:    clave_agente, ops user ID, or bot identifier
--
-- This table is APPEND-ONLY. No updates, no deletes.
-- ============================================================

CREATE TABLE IF NOT EXISTS solicitud_status_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id    uuid        NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,

  -- Transition
  from_status     text,        -- NULL on initial insert
  to_status       text        NOT NULL,

  -- Actor
  actor_type      text        NOT NULL DEFAULT 'system'
                    CHECK (actor_type IN ('agente', 'ops', 'system', 'emisor_bot')),
  actor_id        text,        -- clave_agente, user UUID, or 'system'

  -- Source channel / context
  source          text        NOT NULL DEFAULT 'system',
    -- 'wizard'        — Next.js wizard submission
    -- 'emisor_bot'    — automated GNP emission pipeline
    -- 'ops_dashboard' — manual ops action
    -- 'system'        — background job, cron
    -- 'api'           — external API call

  -- Human-readable reason (optional but encouraged)
  reason          text,
    -- e.g. "Póliza emitida: GNP-12345678"
    --      "Rechazada por GNP: RFC no coincide"
    --      "Re-abierta para corrección de nombre"

  -- Structured metadata (arbitrary key/values for this transition)
  metadata        jsonb,
    -- e.g. {"poliza_id": "...", "num_poliza": "GNP-12345678"}
    --      {"rejection_code": "E001", "gnp_message": "RFC invalido"}

  -- Immutable timestamp (always use DEFAULT, never allow override)
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- This table is APPEND-ONLY.
-- Prevent updates and deletes at the DB level.
-- ----------------------------------------------------------

CREATE OR REPLACE RULE no_update_status_history AS
  ON UPDATE TO solicitud_status_history
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_delete_status_history AS
  ON DELETE TO solicitud_status_history
  DO INSTEAD NOTHING;

-- ----------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_status_hist_solicitud_id
  ON solicitud_status_history(solicitud_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_hist_to_status
  ON solicitud_status_history(to_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_hist_actor
  ON solicitud_status_history(actor_type, actor_id, created_at DESC);

-- ----------------------------------------------------------
-- Convenience function: record a status transition
-- Updates solicitudes.status AND inserts history row
-- atomically.
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_transition_solicitud_status(
  p_solicitud_id  uuid,
  p_to_status     text,
  p_actor_type    text DEFAULT 'system',
  p_actor_id      text DEFAULT 'system',
  p_source        text DEFAULT 'system',
  p_reason        text DEFAULT NULL,
  p_metadata      jsonb DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_from_status text;
BEGIN
  -- Get current status
  SELECT status INTO v_from_status
    FROM solicitudes
   WHERE id = p_solicitud_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud % not found', p_solicitud_id;
  END IF;

  -- Update current status
  UPDATE solicitudes
     SET status     = p_to_status,
         updated_at = now()
   WHERE id = p_solicitud_id;

  -- Append history row
  INSERT INTO solicitud_status_history (
    solicitud_id, from_status, to_status,
    actor_type, actor_id, source, reason, metadata
  ) VALUES (
    p_solicitud_id, v_from_status, p_to_status,
    p_actor_type, p_actor_id, p_source, p_reason, p_metadata
  );
END;
$$;

-- ----------------------------------------------------------
-- Trigger: auto-log initial 'pendiente' status on INSERT
-- (so every solicitud has at least one history row)
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_solicitud_initial_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO solicitud_status_history (
    solicitud_id, from_status, to_status,
    actor_type, actor_id, source, reason
  ) VALUES (
    NEW.id,
    NULL,
    NEW.status,
    'system',
    'wizard',
    'wizard',
    'Solicitud creada'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitud_log_initial_status ON solicitudes;
CREATE TRIGGER trg_solicitud_log_initial_status
  AFTER INSERT ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION trg_solicitud_initial_status();

-- ----------------------------------------------------------
-- View: latest status per solicitud (for quick dashboard queries)
-- ----------------------------------------------------------

CREATE OR REPLACE VIEW v_solicitud_status_current AS
SELECT DISTINCT ON (solicitud_id)
  solicitud_id,
  from_status,
  to_status       AS current_status,
  actor_type,
  actor_id,
  source,
  reason,
  created_at      AS transitioned_at
FROM solicitud_status_history
ORDER BY solicitud_id, created_at DESC;

COMMENT ON VIEW v_solicitud_status_current IS
  'Latest status transition per solicitud. Use for current-state snapshots.';
