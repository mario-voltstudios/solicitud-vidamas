-- ─────────────────────────────────────────────────────────────────────────────
-- Filtro de Calidad v1 — Quality Schema
-- Run in: ASTRO Supabase (https://supabase.com/dashboard/project/lszwokdthvgzcjdlwxzp/sql)
-- Generated: 2026-03-16
-- Phase: 1 — Schema + rule persistence
-- ─────────────────────────────────────────────────────────────────────────────
-- Tables created:
--   quality_runs           – one row per scan invocation
--   quality_findings       – one finding/stop/flag per policy per rule
--   quality_overrides      – Mario-only override records
--   policy_quality_state   – materialized current state per policy/case
--   email_policy_events    – normalized email-derived signals
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Enums ───────────────────────────────────────────────────────────────────

-- Run types
DO $$ BEGIN
  CREATE TYPE quality_run_type AS ENUM (
    'intake',       -- pre-emisión hook
    'retroactive',  -- retro scan on historical policies
    'on_demand'     -- manual / prompted run
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Run scope
DO $$ BEGIN
  CREATE TYPE quality_scope_type AS ENUM (
    'policy',       -- specific policy numbers
    'agent',        -- by agent(s)
    'date_range',   -- emission date window
    'dependencia',  -- GOB CDMX / IMSS / SEP / etc.
    'team'          -- agent team
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Finding severity
DO $$ BEGIN
  CREATE TYPE quality_severity AS ENUM (
    'stop',  -- hard stop — requires Mario override to proceed
    'flag',  -- advisory flag — logged, does not block by itself
    'info'   -- informational evidence attachment
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Finding category (maps to rule families from the bible)
DO $$ BEGIN
  CREATE TYPE quality_category AS ENUM (
    'fraud',
    'duplicate',
    'seller_mismatch',
    'existing_policy',      -- reciclado / prior GNP póliza
    'cancellation',         -- email-detected cancellation signal
    'expediente',           -- GNP Expediente Digital SLA issue
    'payroll_capacity',     -- Nomipay / capacidad de líquido
    'doc_authenticity',
    'face_match',           -- INE vs video face comparison
    'dependency_requirement', -- carpeta de liberación overlay
    'legal_compliance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Override decision
DO $$ BEGIN
  CREATE TYPE override_decision AS ENUM (
    'approved',  -- Mario approves to proceed despite finding
    'rejected'   -- Mario confirms finding; blocks emission
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Email event type
DO $$ BEGIN
  CREATE TYPE email_event_type AS ENUM (
    'cancellation_signal',
    'expediente_issue',
    'expediente_complete'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Expediente SLA state (also used in policy_quality_state.expediente_state)
DO $$ BEGIN
  CREATE TYPE expediente_state AS ENUM (
    'expediente_clean',
    'expediente_issue_open',
    'expediente_resolved_in_sla',
    'expediente_resolved_late',
    'expediente_sla_breached'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Status labels (Spanish-friendly, stored in quality_findings.status_label)
-- These are free-text labels from a defined vocabulary.
-- See: bibles/discord-filtro-calidad.md — "Status labels"
-- Valid values (enforced via CHECK):
--   approved_for_emision
--   blocked_fraud_risk
--   blocked_duplicate_risk
--   blocked_eligibility_risk
--   blocked_existing_policy_risk
--   blocked_cancellation_risk
--   blocked_doc_authenticity_risk
--   pending_manual_review
--   retroactive_watch
--   retroactive_urgent

-- ─── 1. quality_runs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quality_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type        quality_run_type  NOT NULL,
  scope_type      quality_scope_type NOT NULL,
  scope_payload   jsonb             NOT NULL DEFAULT '{}',
  -- e.g. {"policy_numbers": ["P001","P002"]} or {"agent_ids": [...], "days": 365}
  started_at      timestamptz       NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  requested_by    text              NOT NULL, -- user id or 'jarvis-cron' / 'jarvis-intake'
  summary         jsonb             -- {total, stops, flags, infos, hard_stop_count, ...}
);

COMMENT ON TABLE  quality_runs IS 'One row per Filtro de Calidad scan invocation.';
COMMENT ON COLUMN quality_runs.scope_payload IS 'Structured scope: policy_numbers | agent_ids | date_range | dependencia | team_id.';
COMMENT ON COLUMN quality_runs.summary IS 'Post-run summary: totals, buckets, action queues.';

-- ─── 2. quality_findings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quality_findings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_run_id  uuid              NOT NULL REFERENCES quality_runs(id) ON DELETE CASCADE,
  solicitud_id    text,             -- FK intent to solicitudes.id (nullable for retro runs)
  policy_number   text,             -- GNP policy number, nullable for pre-emisión
  agent_id        text,             -- agent identifier
  dependencia     text,             -- GOB CDMX / IMSS / SEP CENTRAL / etc.
  severity        quality_severity  NOT NULL,
  category        quality_category  NOT NULL,
  rule_code       text              NOT NULL,
  -- Vocabulary: e.g. FD-001 (fraude/duplicado), SM-001 (seller mismatch),
  --   EP-001 (existing policy), CX-001 (cancellation email),
  --   EX-001..EX-005 (expediente states), PC-001/PC-002 (payroll capacity),
  --   FM-001 (face match), DA-001 (doc authenticity), DR-001 (dependency req)
  status_label    text              NOT NULL
    CHECK (status_label IN (
      'approved_for_emision',
      'blocked_fraud_risk',
      'blocked_duplicate_risk',
      'blocked_eligibility_risk',
      'blocked_existing_policy_risk',
      'blocked_cancellation_risk',
      'blocked_doc_authenticity_risk',
      'pending_manual_review',
      'retroactive_watch',
      'retroactive_urgent'
    )),
  title           text              NOT NULL,
  detail          text,
  evidence        jsonb             DEFAULT '{}',
  -- e.g. { "video_url": "...", "frame_urls": [...], "ine_url": "...",
  --         "email_message_id": "...", "nomipay_result": {...},
  --         "duplicate_solicitud_id": "..." }
  detected_at     timestamptz       NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolution_notes text
);

COMMENT ON TABLE  quality_findings IS 'One finding/stop/flag per rule per policy/case.';
COMMENT ON COLUMN quality_findings.rule_code IS 'Short code identifying the specific rule that fired (e.g. SM-001, EX-003).';
COMMENT ON COLUMN quality_findings.evidence IS 'Arbitrary evidence payload: URLs, raw data, linked records.';

CREATE INDEX IF NOT EXISTS idx_quality_findings_run      ON quality_findings(quality_run_id);
CREATE INDEX IF NOT EXISTS idx_quality_findings_policy   ON quality_findings(policy_number);
CREATE INDEX IF NOT EXISTS idx_quality_findings_solicitud ON quality_findings(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_quality_findings_severity ON quality_findings(severity);
CREATE INDEX IF NOT EXISTS idx_quality_findings_category ON quality_findings(category);
CREATE INDEX IF NOT EXISTS idx_quality_findings_status   ON quality_findings(status_label);

-- ─── 3. quality_overrides ────────────────────────────────────────────────────
-- Only Mario can insert rows here (enforced at application layer + RLS below).

CREATE TABLE IF NOT EXISTS quality_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id      uuid              NOT NULL REFERENCES quality_findings(id) ON DELETE RESTRICT,
  decision        override_decision NOT NULL,
  reason          text              NOT NULL,  -- mandatory per bible
  notes           text,
  overridden_by   text              NOT NULL,  -- user id — must be Mario
  overridden_at   timestamptz       NOT NULL DEFAULT now(),

  -- Integrity: one active override per finding
  CONSTRAINT uq_override_per_finding UNIQUE (finding_id)
);

COMMENT ON TABLE  quality_overrides IS 'Mario-only override trail. One override per finding maximum.';
COMMENT ON COLUMN quality_overrides.overridden_by IS 'Must be Mario''s user id. Enforced at application + RLS level.';

-- ─── RLS: Mario-only override insert ────────────────────────────────────────
-- Replace 'mario-user-id-placeholder' with Mario's actual Supabase auth.uid()
-- before enabling RLS on this table.
--
-- ALTER TABLE quality_overrides ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "mario_only_overrides" ON quality_overrides
--   FOR ALL
--   USING      (overridden_by = auth.uid()::text)
--   WITH CHECK (overridden_by = auth.uid()::text AND auth.uid()::text = 'MARIO_UID_HERE');
--
-- GRANT INSERT, SELECT ON quality_overrides TO authenticated;
-- GRANT SELECT ON quality_overrides TO service_role;

-- ─── 4. policy_quality_state ─────────────────────────────────────────────────
-- Materialized current state per policy / case.
-- Upserted by the filter engine after each run.

CREATE TABLE IF NOT EXISTS policy_quality_state (
  -- Natural key: prefer policy_number when available, else solicitud_id
  policy_number         text,
  solicitud_id          text,
  overall_state         text              NOT NULL DEFAULT 'pending_manual_review'
    CHECK (overall_state IN (
      'approved_for_emision',
      'blocked_fraud_risk',
      'blocked_duplicate_risk',
      'blocked_eligibility_risk',
      'blocked_existing_policy_risk',
      'blocked_cancellation_risk',
      'blocked_doc_authenticity_risk',
      'pending_manual_review',
      'retroactive_watch',
      'retroactive_urgent'
    )),
  hard_stop_count       int               NOT NULL DEFAULT 0,
  flag_count            int               NOT NULL DEFAULT 0,
  latest_run_id         uuid              REFERENCES quality_runs(id),

  -- Per-dimension states (null = not yet evaluated)
  cancellation_state    text,             -- 'clean' | 'signal_detected' | 'confirmed'
  expediente_state      expediente_state,
  payroll_state         text,             -- 'verified' | 'failed' | 'unverifiable'
  seller_state          text,             -- 'ok' | 'missing_name' | 'mismatch'
  duplicate_state       text,             -- 'clean' | 'possible_same_person' | 'confirmed_different'
  face_state            text,             -- 'match' | 'low_confidence' | 'mismatch' | 'no_data'
  existing_policy_state text,             -- 'none' | 'has_policy_stated_no_cancel' | 'has_policy_no_statement'

  override_required     boolean           NOT NULL DEFAULT false,
  updated_at            timestamptz       NOT NULL DEFAULT now(),

  PRIMARY KEY (COALESCE(policy_number, ''), COALESCE(solicitud_id, '')),
  CONSTRAINT pqs_at_least_one_key CHECK (
    policy_number IS NOT NULL OR solicitud_id IS NOT NULL
  )
);

COMMENT ON TABLE policy_quality_state IS 'Materialized current quality state per policy/case. Upserted on every run.';

CREATE INDEX IF NOT EXISTS idx_pqs_overall_state     ON policy_quality_state(overall_state);
CREATE INDEX IF NOT EXISTS idx_pqs_override_required ON policy_quality_state(override_required) WHERE override_required = true;
CREATE INDEX IF NOT EXISTS idx_pqs_expediente_state  ON policy_quality_state(expediente_state);
CREATE INDEX IF NOT EXISTS idx_pqs_solicitud         ON policy_quality_state(solicitud_id);

-- ─── 5. email_policy_events ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_policy_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id text              NOT NULL UNIQUE,
  -- Gmail message ID — prevents duplicate ingestion
  policy_number     text              NOT NULL,
  event_type        email_event_type  NOT NULL,
  matched_phrase    text,             -- exact substring that matched (e.g. "cancelación")
  occurred_at       timestamptz       NOT NULL,
  raw_subject       text,
  raw_from          text,
  detail            jsonb             DEFAULT '{}'
  -- e.g. { "confidence": "high", "linked_rfc": "...", "ingest_run_id": "..." }
);

COMMENT ON TABLE  email_policy_events IS 'Normalized email-derived signals: cancellation + expediente events.';
COMMENT ON COLUMN email_policy_events.source_message_id IS 'Gmail message ID — unique constraint prevents double-ingest.';
COMMENT ON COLUMN email_policy_events.policy_number IS 'GNP policy number extracted from email subject/body.';

CREATE INDEX IF NOT EXISTS idx_epe_policy_number ON email_policy_events(policy_number);
CREATE INDEX IF NOT EXISTS idx_epe_event_type    ON email_policy_events(event_type);
CREATE INDEX IF NOT EXISTS idx_epe_occurred_at   ON email_policy_events(occurred_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rule code registry (reference table — no FK enforcement, used for docs/UI)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quality_rule_codes (
  rule_code   text PRIMARY KEY,
  category    quality_category  NOT NULL,
  severity    quality_severity  NOT NULL,
  description text              NOT NULL,
  is_hard_stop boolean          NOT NULL DEFAULT true,
  active      boolean           NOT NULL DEFAULT true
);

COMMENT ON TABLE quality_rule_codes IS 'Registry of all rule codes. Source of truth for the filter engine.';

INSERT INTO quality_rule_codes (rule_code, category, severity, description, is_hard_stop) VALUES
  -- Fraud / duplicate
  ('FD-001', 'duplicate',            'stop', 'Teléfono duplicado en identidad diferente',         true),
  ('FD-002', 'duplicate',            'stop', 'Matrícula/clave empleado duplicada en identidad diferente', true),
  ('FD-003', 'duplicate',            'stop', 'RFC duplicado en identidad diferente',               true),
  ('FD-004', 'duplicate',            'stop', 'CFDI UUID duplicado',                                true),
  ('FD-005', 'duplicate',            'flag', 'Posible misma persona — revisar manualmente',        false),
  -- Seller mismatch
  ('SM-001', 'seller_mismatch',      'stop', 'Nombre del vendedor no aparece en video',            true),
  ('SM-002', 'seller_mismatch',      'stop', 'Nombre en video no coincide con agente registrado',  true),
  -- Existing policy / reciclado
  ('EP-001', 'existing_policy',      'stop', 'Póliza GNP vigente sin declaración de no cancelar en video', true),
  ('EP-002', 'existing_policy',      'info', 'Póliza GNP vigente — video declara que no cancela',  false),
  -- Cancellation signals
  ('CX-001', 'cancellation',         'stop', 'Email de cancelación con número de póliza exacto',   true),
  ('CX-002', 'cancellation',         'flag', 'Señal de cancelación vinculada por persona (nombre/RFC/tel)', false),
  -- Expediente Digital
  ('EX-001', 'expediente',           'info', 'Expediente sin incidencia',                          false),
  ('EX-002', 'expediente',           'stop', 'Expediente con incidencia abierta (dentro de SLA)',  true),
  ('EX-003', 'expediente',           'stop', 'Expediente — SLA vencido sin resolución',            true),
  ('EX-004', 'expediente',           'stop', 'Expediente resuelto tardíamente (fuera de SLA)',     true),
  ('EX-005', 'expediente',           'info', 'Expediente resuelto dentro de SLA',                  false),
  -- Payroll capacity
  ('PC-001', 'payroll_capacity',     'stop', 'Capacidad de líquido IMSS insuficiente',             true),
  ('PC-002', 'payroll_capacity',     'stop', 'Nomipay — no se pudo verificar capacidad GOB/SEP',   true),
  ('PC-003', 'payroll_capacity',     'flag', 'Fórmula estricta (carpeta liberación) — capacidad ajustada', false),
  -- Face match
  ('FM-001', 'face_match',           'stop', 'Face match inconcluso o baja confianza INE vs video', true),
  ('FM-002', 'face_match',           'stop', 'Face match negativo — identidades no coinciden',      true),
  ('FM-003', 'face_match',           'info', 'Face match aprobado',                                 false),
  -- Doc authenticity
  ('DA-001', 'doc_authenticity',     'stop', 'Documento con señales de alteración',                true),
  -- Dependency requirement
  ('DR-001', 'dependency_requirement','stop','Documento requerido por carpeta de liberación faltante', true),
  ('DR-002', 'dependency_requirement','flag','Requisito específico de dependencia — revisar',      false),
  -- Legal compliance
  ('LC-001', 'legal_compliance',     'stop', 'Bloqueador legal específico de dependencia',         true)
ON CONFLICT (rule_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper view: open hard-stop queue for Mario
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_quality_hard_stop_queue AS
SELECT
  f.id               AS finding_id,
  f.solicitud_id,
  f.policy_number,
  f.agent_id,
  f.dependencia,
  f.rule_code,
  f.status_label,
  f.title,
  f.detail,
  f.detected_at,
  f.evidence,
  r.run_type,
  r.scope_type,
  r.requested_by,
  o.id               AS override_id,
  o.decision         AS override_decision,
  o.reason           AS override_reason,
  o.overridden_at
FROM quality_findings f
JOIN quality_runs r ON r.id = f.quality_run_id
LEFT JOIN quality_overrides o ON o.finding_id = f.id
WHERE f.severity = 'stop'
  AND f.resolved_at IS NULL
ORDER BY f.detected_at DESC;

COMMENT ON VIEW v_quality_hard_stop_queue IS 'Open hard stops pending Mario review/override.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper view: expediente SLA breach watch
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW v_expediente_sla_watch AS
SELECT
  pqs.policy_number,
  pqs.solicitud_id,
  pqs.expediente_state,
  pqs.overall_state,
  pqs.updated_at,
  epe.occurred_at   AS issue_detected_at,
  epe.raw_subject,
  epe.detail
FROM policy_quality_state pqs
LEFT JOIN email_policy_events epe
  ON epe.policy_number = pqs.policy_number
  AND epe.event_type = 'expediente_issue'
WHERE pqs.expediente_state IN (
  'expediente_issue_open',
  'expediente_sla_breached',
  'expediente_resolved_late'
)
ORDER BY epe.occurred_at ASC;

COMMENT ON VIEW v_expediente_sla_watch IS 'Policies with open or breached Expediente Digital SLA.';

-- ─────────────────────────────────────────────────────────────────────────────
-- END OF MIGRATION
-- ─────────────────────────────────────────────────────────────────────────────
