-- ============================================================
-- Migration 011: Filtro de Calidad v1 — Quality Layer
-- Created: 2026-03-16
-- Purpose: Quality-control tables for pre-emisión intake
--          enforcement, retroactive scans, email signals,
--          and Mario-only override trail.
--
-- SAFE TO RUN independently — no edits to existing tables.
-- All new tables are prefixed quality_ or email_policy_events.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. quality_runs
--    One row per scan invocation (intake | retroactive | on_demand)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quality_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type        TEXT NOT NULL CHECK (run_type IN ('intake', 'retroactive', 'on_demand')),
  scope_type      TEXT NOT NULL CHECK (scope_type IN ('policy', 'agent', 'date_range', 'dependencia', 'team', 'folio')),
  scope_payload   JSONB NOT NULL DEFAULT '{}',   -- e.g. { "agent_id": "ABC123", "from": "2026-02-01", "to": "2026-02-28" }
  status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  requested_by    TEXT,                           -- 'mario' | clave_agente | 'system'
  summary         JSONB,                          -- { total, hard_stops, flags, by_category }
  error_detail    TEXT
);

CREATE INDEX IF NOT EXISTS idx_quality_runs_run_type ON quality_runs (run_type);
CREATE INDEX IF NOT EXISTS idx_quality_runs_started_at ON quality_runs (started_at);

-- ──────────────────────────────────────────────────────────────
-- 2. quality_findings
--    One row per finding / flag / stop per policy/solicitud.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quality_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_run_id  UUID REFERENCES quality_runs(id) ON DELETE CASCADE,
  solicitud_id    UUID REFERENCES solicitudes(id) ON DELETE SET NULL,
  policy_number   TEXT,
  agent_id        TEXT,
  dependencia     TEXT,
  severity        TEXT NOT NULL CHECK (severity IN ('stop', 'flag', 'info')),
  category        TEXT NOT NULL CHECK (category IN (
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
  )),
  rule_code       TEXT NOT NULL,   -- e.g. 'SELLER_NAME_MISSING', 'DUPLICATE_RFC', 'EXPEDIENTE_SLA_BREACH'
  status_label    TEXT NOT NULL,   -- from spec status labels
  title           TEXT NOT NULL,
  detail          TEXT,
  evidence        JSONB,           -- { source, value, compared_to, confidence, ... }
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_quality_findings_solicitud ON quality_findings (solicitud_id);
CREATE INDEX IF NOT EXISTS idx_quality_findings_policy ON quality_findings (policy_number);
CREATE INDEX IF NOT EXISTS idx_quality_findings_severity ON quality_findings (severity);
CREATE INDEX IF NOT EXISTS idx_quality_findings_category ON quality_findings (category);
CREATE INDEX IF NOT EXISTS idx_quality_findings_run ON quality_findings (quality_run_id);
CREATE INDEX IF NOT EXISTS idx_quality_findings_status ON quality_findings (status_label);

-- ──────────────────────────────────────────────────────────────
-- 3. quality_overrides
--    Mario-only decision trail.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quality_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id      UUID NOT NULL REFERENCES quality_findings(id) ON DELETE CASCADE,
  decision        TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason          TEXT NOT NULL,
  notes           TEXT,
  overridden_by   TEXT NOT NULL DEFAULT 'mario',
  overridden_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_overrides_finding ON quality_overrides (finding_id);

-- ──────────────────────────────────────────────────────────────
-- 4. policy_quality_state
--    Materialized current state per policy / solicitud.
--    Upserted after each run.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_quality_state (
  -- primary key: policy_number when known, solicitud_id when pre-emisión
  solicitud_id             UUID REFERENCES solicitudes(id) ON DELETE CASCADE,
  policy_number            TEXT,
  overall_state            TEXT NOT NULL,  -- matches status_label enum
  hard_stop_count          INT NOT NULL DEFAULT 0,
  flag_count               INT NOT NULL DEFAULT 0,
  latest_run_id            UUID REFERENCES quality_runs(id),
  cancellation_state       TEXT,           -- 'clean' | 'signal_detected' | 'confirmed'
  expediente_state         TEXT,           -- expediente states from spec
  payroll_state            TEXT,           -- 'verified' | 'failed' | 'unverifiable' | 'pending'
  seller_state             TEXT,           -- 'ok' | 'missing' | 'mismatch'
  duplicate_state          TEXT,           -- 'clean' | 'suspected' | 'confirmed'
  face_state               TEXT,           -- 'ok' | 'inconclusive' | 'mismatch'
  existing_policy_state    TEXT,           -- 'none' | 'present_consented' | 'present_no_consent'
  override_required        BOOLEAN NOT NULL DEFAULT false,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT policy_quality_state_pk PRIMARY KEY (solicitud_id, policy_number),
  CONSTRAINT policy_quality_state_has_id CHECK (
    solicitud_id IS NOT NULL OR policy_number IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_pqs_policy ON policy_quality_state (policy_number);
CREATE INDEX IF NOT EXISTS idx_pqs_state ON policy_quality_state (overall_state);
CREATE INDEX IF NOT EXISTS idx_pqs_override ON policy_quality_state (override_required);

-- ──────────────────────────────────────────────────────────────
-- 5. email_policy_events
--    Normalized signals from Gmail ingestion.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_policy_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id TEXT UNIQUE NOT NULL,   -- Gmail message ID (dedup)
  policy_number     TEXT NOT NULL,
  event_type        TEXT NOT NULL CHECK (event_type IN (
    'cancellation_signal',
    'expediente_issue',
    'expediente_complete'
  )),
  matched_phrase    TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL,   -- Date header from email
  raw_subject       TEXT,
  raw_from          TEXT,
  detail            JSONB,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_policy ON email_policy_events (policy_number);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_policy_events (event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred ON email_policy_events (occurred_at);

-- ──────────────────────────────────────────────────────────────
-- Helper view: open hard stops needing Mario review
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_open_hard_stops AS
SELECT
  f.id,
  f.solicitud_id,
  f.policy_number,
  f.agent_id,
  f.dependencia,
  f.category,
  f.rule_code,
  f.title,
  f.detail,
  f.evidence,
  f.detected_at,
  o.id AS override_id,
  o.decision AS override_decision
FROM quality_findings f
LEFT JOIN quality_overrides o ON o.finding_id = f.id
WHERE f.severity = 'stop'
  AND f.resolved_at IS NULL
  AND o.id IS NULL
ORDER BY f.detected_at DESC;

-- ──────────────────────────────────────────────────────────────
-- Helper view: expediente SLA tracking
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_expediente_sla AS
SELECT
  issue.policy_number,
  issue.occurred_at AS issue_detected_at,
  complete.occurred_at AS completed_at,
  CASE
    WHEN complete.occurred_at IS NULL THEN 'expediente_issue_open'
    -- 5 business days = ~7 calendar days (rough; exact calc done in app)
    WHEN complete.occurred_at <= issue.occurred_at + INTERVAL '7 days' THEN 'expediente_resolved_in_sla'
    ELSE 'expediente_resolved_late'
  END AS expediente_state
FROM email_policy_events issue
LEFT JOIN LATERAL (
  SELECT occurred_at
  FROM email_policy_events
  WHERE policy_number = issue.policy_number
    AND event_type = 'expediente_complete'
    AND occurred_at > issue.occurred_at
  ORDER BY occurred_at ASC
  LIMIT 1
) complete ON true
WHERE issue.event_type = 'expediente_issue';
