-- ============================================================
-- Filtro de Calidad v1 — Quality Layer Schema
-- 011_filtro_calidad_quality_layer.sql
-- Created: 2026-03-16
-- ============================================================
-- PURPOSE:
--   Adds 5 tables that power the Filtro de Calidad engine:
--     1. quality_runs          — scan invocations
--     2. quality_findings      — one row per flag/stop per policy
--     3. quality_overrides     — Mario-only override trail
--     4. policy_quality_state  — materialized current state per policy
--     5. email_policy_events   — normalized email-derived signals
-- ============================================================

-- ----------------------------------------------------------
-- 1. quality_runs — tracks each scan invocation
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS quality_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type       text        NOT NULL CHECK (run_type IN ('intake', 'retroactive', 'on_demand')),
  scope_type     text        NOT NULL CHECK (scope_type IN ('policy', 'agent', 'date_range', 'dependencia', 'team')),
  scope_payload  jsonb       NOT NULL DEFAULT '{}',
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  requested_by   text        NOT NULL,   -- 'jarvis' | 'mario' | agent_id
  summary        jsonb       DEFAULT '{}'
);

-- ----------------------------------------------------------
-- 2. quality_findings — one row per finding per policy/case
-- ----------------------------------------------------------
CREATE TYPE IF NOT EXISTS finding_severity AS ENUM ('stop', 'flag', 'info');
CREATE TYPE IF NOT EXISTS finding_category AS ENUM (
  'fraud',
  'duplicate',
  'seller_mismatch',
  'existing_policy',
  'cancellation',
  'expediente',
  'payroll_capacity',
  'doc_authenticity',
  'face_match',
  'dependency_requirement',
  'legal_compliance'
);

CREATE TABLE IF NOT EXISTS quality_findings (
  id               uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_run_id   uuid             REFERENCES quality_runs(id) ON DELETE SET NULL,
  solicitud_id     uuid             REFERENCES solicitudes(id) ON DELETE SET NULL,
  policy_number    text,            -- exact GNP policy number, e.g. "GNP-12345678"
  agent_id         text,
  dependencia      text,
  severity         finding_severity NOT NULL,
  category         finding_category NOT NULL,
  rule_code        text        NOT NULL,   -- e.g. 'EMAIL_CANCEL_EXACT_POLIZA'
  status_label     text        NOT NULL,   -- matches enum in bible
  title            text        NOT NULL,
  detail           text,
  evidence         jsonb       DEFAULT '{}',
  detected_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  resolution_notes text
);

CREATE INDEX IF NOT EXISTS idx_quality_findings_policy   ON quality_findings(policy_number);
CREATE INDEX IF NOT EXISTS idx_quality_findings_run      ON quality_findings(quality_run_id);
CREATE INDEX IF NOT EXISTS idx_quality_findings_solicit  ON quality_findings(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_quality_findings_category ON quality_findings(category);

-- ----------------------------------------------------------
-- 3. quality_overrides — Mario-only override trail
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS quality_overrides (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id      uuid        NOT NULL REFERENCES quality_findings(id),
  decision        text        NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason          text        NOT NULL,
  notes           text,
  overridden_by   text        NOT NULL DEFAULT 'mario',
  overridden_at   timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- 4. policy_quality_state — materialized current state
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS policy_quality_state (
  policy_number          text        PRIMARY KEY,
  solicitud_id           uuid        REFERENCES solicitudes(id) ON DELETE SET NULL,
  overall_state          text        NOT NULL DEFAULT 'pending',
  hard_stop_count        integer     NOT NULL DEFAULT 0,
  flag_count             integer     NOT NULL DEFAULT 0,
  latest_run_id          uuid        REFERENCES quality_runs(id) ON DELETE SET NULL,

  -- per-dimension states
  cancellation_state     text        NOT NULL DEFAULT 'unknown',   -- see email_intel.ts
  expediente_state       text        NOT NULL DEFAULT 'expediente_clean',  -- see expediente-sla.ts
  payroll_state          text        NOT NULL DEFAULT 'unknown',
  seller_state           text        NOT NULL DEFAULT 'unknown',
  duplicate_state        text        NOT NULL DEFAULT 'unknown',
  face_state             text        NOT NULL DEFAULT 'unknown',
  existing_policy_state  text        NOT NULL DEFAULT 'unknown',

  override_required      boolean     NOT NULL DEFAULT false,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------
-- 5. email_policy_events — normalized email-derived signals
-- ----------------------------------------------------------
CREATE TYPE IF NOT EXISTS email_event_type AS ENUM (
  'cancellation_signal',
  'expediente_issue',
  'expediente_complete'
);

CREATE TABLE IF NOT EXISTS email_policy_events (
  id                 uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id  text             NOT NULL,   -- Gmail message ID
  policy_number      text             NOT NULL,   -- exact match required
  event_type         email_event_type NOT NULL,
  matched_phrase     text,
  occurred_at        timestamptz      NOT NULL,
  raw_subject        text,
  raw_from           text,
  detail             jsonb            DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_policy_events_msg ON email_policy_events(source_message_id, event_type);
CREATE INDEX IF NOT EXISTS idx_email_policy_events_poliza ON email_policy_events(policy_number);
CREATE INDEX IF NOT EXISTS idx_email_policy_events_occurred ON email_policy_events(occurred_at);
