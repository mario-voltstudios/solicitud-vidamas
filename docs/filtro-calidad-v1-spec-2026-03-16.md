# Filtro de Calidad v1 — Spec (2026-03-16)

## Goal
Implement a reusable quality-control system for Prospera VidaMás that can run both:
- **pre-emisión** on new intake
- **retroactively** on historical pólizas / production windows

The system must block risky cases, persist evidence, track Mario-only overrides, and support promptable bulk runs.

## User-facing examples
- Run filtro calidad for all pólizas emitted in February
- Run filtro calidad for these 2 agents, last 365 days
- Run filtro calidad for policy numbers X, Y, Z
- Run filtro calidad on GOB CDMX last 90 days
- Show only hard stops

## Core architecture
- **ASTRO Supabase**: quality tables, evidence, overrides, retro results
- **solicitud-vidamas**: intake hooks / pre-emisión rules / submission status gating
- **CEO Dashboard / ASTRO ops**: review queue, override queue, SLA visibility
- **jobs/cron**: retro scan, Gmail ingest, expediente SLA tracking

## Core entities to add
### 1. quality_runs
Tracks a scan invocation.

Suggested fields:
- id
- run_type (`intake`, `retroactive`, `on_demand`)
- scope_type (`policy`, `agent`, `date_range`, `dependencia`, `team`)
- scope_payload jsonb
- started_at
- finished_at
- requested_by
- summary jsonb

### 2. quality_findings
One row per quality finding / stop / flag for a policy/case.

Suggested fields:
- id
- quality_run_id
- solicitud_id nullable
- policy_number nullable
- agent_id nullable
- dependencia nullable
- severity (`stop`, `flag`, `info`)
- category (`fraud`, `duplicate`, `seller_mismatch`, `existing_policy`, `cancellation`, `expediente`, `payroll_capacity`, `doc_authenticity`, `face_match`, `dependency_requirement`, `legal_compliance`)
- rule_code
- status_label
- title
- detail
- evidence jsonb
- detected_at
- resolved_at nullable
- resolution_notes nullable

### 3. quality_overrides
Mario-only overrides.

Suggested fields:
- id
- finding_id
- decision (`approved`, `rejected`)
- reason
- notes
- overridden_by
- overridden_at

### 4. policy_quality_state
Materialized/current state per policy / case.

Suggested fields:
- policy_number
- solicitud_id nullable
- overall_state
- hard_stop_count
- flag_count
- latest_run_id
- cancellation_state
- expediente_state
- payroll_state
- seller_state
- duplicate_state
- face_state
- existing_policy_state
- override_required boolean
- updated_at

### 5. email_policy_events
Normalized email-derived signals.

Suggested fields:
- id
- source_message_id
- policy_number
- event_type (`cancellation_signal`, `expediente_issue`, `expediente_complete`)
- matched_phrase
- occurred_at
- raw_subject
- raw_from
- detail jsonb

## Rule set
### A. Hard stops by default
All major quality issues are blockers unless explicitly marked as flag-only.

### B. Mario override
- only Mario can override
- mandatory fields: decision, reason, timestamp, notes

### C. Existing policy / reciclado
If current GNP policy exists:
- allow only if video explicitly states the person does **not** want to cancel current pólizas
- otherwise stop

### D. Seller identity in video
- seller name must be spoken in video
- seller name must match agent of record / submitting agent
- missing or mismatch = stop

### E. Duplicate identity keys
- same phone / matrícula / employee key / RFC / CFDI UUID is allowed only when it is clearly the same person
- otherwise stop

### F. Payroll capacity
#### GOB CDMX + some SEP
- verified through Nomipay
- fail or unverifiable = stop

#### IMSS
- capacidad de líquido = stopper
- stricter formula from carpetas de liberación = flag only

### G. Expediente Digital email SLA
If there is an email with exact policy number + expediente signal:
- open issue
- start 5-business-day SLA
- if later exact policy number email says COMPLETO within SLA => resolved in SLA
- if no COMPLETO in time => SLA breached
- if COMPLETO arrives late => resolved late

### H. Cancellation email detection
- policy-number-centric direct hit
- keyword family includes cancelar / cancelación with or without accents
- person-level linkage can still add review signals where confidence is high

### I. Face match
- pipeline with pluggable vendor
- low-confidence / inconclusive / suspicious = stop

### J. Dependency-specific legal/doc overlay
Use carpetas de liberación as source of truth for dependency-specific requirements.

## Delivery phases
### Phase 1 — Schema + rule persistence
- add SQL migration(s) for quality tables
- define rule codes / categories / status labels
- persist overrides

### Phase 2 — Intake hook
- compute pre-emisión findings from solicitud data
- seller/video/existing-policy/payroll gates
- write current quality state

### Phase 3 — Email normalization
- ingest cancellation + expediente emails
- derive expediente SLA state
- update policy quality state

### Phase 4 — Retro runner
- allow promptable bulk runs by policy/agent/date/dependencia
- return structured summaries and action queues

### Phase 5 — Ops UI
- queue for hard stops
- queue for Mario overrides
- queue for expediente SLA breaches

## Immediate implementation notes
1. Reuse current dependency docs and release-folder rules already in repo.
2. Keep wording and labels Spanish-friendly in DB and UI.
3. Design prompt layer around plain language, backed by a structured scope model.
4. Do not make face match or stricter IMSS formula sole approval logic.
