-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012 — Filtro Calidad: email_policy_events unique constraint
--                              + quality_findings resolved columns
-- Run in: ASTRO Supabase (lszwokdthvgzcjdlwxzp)
-- Safe to run multiple times (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add unique constraint on email_policy_events(source_message_id, event_type)
--    Required for upsert idempotency in ingest-emails job.
DO $$ BEGIN
  ALTER TABLE email_policy_events
    ADD CONSTRAINT uq_email_event_msg_type UNIQUE (source_message_id, event_type);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add resolved_at + resolution_notes to quality_findings if not present
--    (may already exist from 011 migration — idempotent via IF NOT EXISTS)
ALTER TABLE quality_findings
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_notes text;

-- 3. Add folio to quality_scope_type enum if missing
--    (intake-hook uses 'folio' scope which may not be in original enum)
DO $$ BEGIN
  ALTER TYPE quality_scope_type ADD VALUE IF NOT EXISTS 'folio';
EXCEPTION WHEN others THEN NULL; END $$;

-- 4. Add status column to quality_runs if missing
ALTER TABLE quality_runs
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed'
    CHECK (status IN ('running', 'completed', 'failed'));

-- 5. Index for fast override queue lookup
CREATE INDEX IF NOT EXISTS idx_quality_findings_open_stops
  ON quality_findings (severity, resolved_at)
  WHERE severity = 'stop' AND resolved_at IS NULL;

-- 6. Index for email events by policy number
CREATE INDEX IF NOT EXISTS idx_email_policy_events_policy
  ON email_policy_events (policy_number);

-- ─── Verification query ───────────────────────────────────────────────────────
-- Run after migration to confirm:
-- SELECT constraint_name FROM information_schema.table_constraints
--   WHERE table_name = 'email_policy_events'
--     AND constraint_type = 'UNIQUE';
