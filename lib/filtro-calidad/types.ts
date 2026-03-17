// ============================================================
// Filtro de Calidad v1 — Canonical Types
// lib/filtro-calidad/types.ts
// Canonical: 2026-03-17 (consolidated from lib/quality/types.ts)
//
// IMPORTANT: snake_case field names throughout — matches DB column names.
// ============================================================

// ──────────────────────────────────────────────────────────────
// Rule codes — one constant per rule, maps to DB rule_code column
// ──────────────────────────────────────────────────────────────
export const RULE_CODES = {
  // Seller / video
  SELLER_NAME_MISSING: 'SELLER_NAME_MISSING',
  SELLER_NAME_MISMATCH: 'SELLER_NAME_MISMATCH',

  // Video completeness
  VIDEO_MISSING: 'VIDEO_MISSING',
  VIDEO_INCOMPLETE_POINTS: 'VIDEO_INCOMPLETE_POINTS',

  // Duplicate identity keys
  DUPLICATE_RFC: 'DUPLICATE_RFC',
  DUPLICATE_MATRICULA: 'DUPLICATE_MATRICULA',
  DUPLICATE_TELEFONO: 'DUPLICATE_TELEFONO',
  DUPLICATE_CFDI_UUID: 'DUPLICATE_CFDI_UUID',

  // Existing policy / reciclado
  EXISTING_POLICY_NO_CONSENT: 'EXISTING_POLICY_NO_CONSENT',
  EXISTING_POLICY_CONSENT_OK: 'EXISTING_POLICY_CONSENT_OK',

  // Payroll capacity
  PAYROLL_NOMIPAY_FAIL: 'PAYROLL_NOMIPAY_FAIL',
  PAYROLL_NOMIPAY_UNVERIFIABLE: 'PAYROLL_NOMIPAY_UNVERIFIABLE',
  PAYROLL_IMSS_LIQUIDEZ_FAIL: 'PAYROLL_IMSS_LIQUIDEZ_FAIL',
  PAYROLL_IMSS_STRICT_FORMULA: 'PAYROLL_IMSS_STRICT_FORMULA',

  // Expediente Digital
  EXPEDIENTE_ISSUE_OPEN: 'EXPEDIENTE_ISSUE_OPEN',
  EXPEDIENTE_SLA_BREACHED: 'EXPEDIENTE_SLA_BREACHED',
  EXPEDIENTE_RESOLVED_LATE: 'EXPEDIENTE_RESOLVED_LATE',

  // Cancellation email signal
  CANCELLATION_EMAIL_MATCH: 'CANCELLATION_EMAIL_MATCH',
  EMAIL_CANCEL_EXACT_POLIZA: 'EMAIL_CANCEL_EXACT_POLIZA',

  // Face match
  FACE_MATCH_INCONCLUSIVE: 'FACE_MATCH_INCONCLUSIVE',
  FACE_MATCH_MISMATCH: 'FACE_MATCH_MISMATCH',

  // Dependency requirements
  MISSING_REQUIRED_DOC: 'MISSING_REQUIRED_DOC',
  DEPENDENCY_LEGAL_BLOCKER: 'DEPENDENCY_LEGAL_BLOCKER',
} as const

export type RuleCode = (typeof RULE_CODES)[keyof typeof RULE_CODES]

// ──────────────────────────────────────────────────────────────
// Finding severity + categories (mirror DB enums)
// ──────────────────────────────────────────────────────────────
export type FindingSeverity = 'stop' | 'flag' | 'info'

export type FindingCategory =
  | 'fraud'
  | 'duplicate'
  | 'seller_mismatch'
  | 'existing_policy'
  | 'cancellation'
  | 'expediente'
  | 'payroll_capacity'
  | 'doc_authenticity'
  | 'face_match'
  | 'dependency_requirement'
  | 'legal_compliance'

// ──────────────────────────────────────────────────────────────
// Status labels (Spanish-friendly, stored in DB)
// ──────────────────────────────────────────────────────────────
export type QualityStatusLabel =
  | 'approved_for_emision'
  | 'blocked_fraud_risk'
  | 'blocked_duplicate_risk'
  | 'blocked_eligibility_risk'
  | 'blocked_existing_policy_risk'
  | 'blocked_cancellation_risk'
  | 'blocked_doc_authenticity_risk'
  | 'pending_manual_review'
  | 'retroactive_watch'
  | 'retroactive_urgent'

// ──────────────────────────────────────────────────────────────
// Core finding type (mirrors DB quality_findings row)
// ──────────────────────────────────────────────────────────────
export interface QualityFinding {
  id?: string
  quality_run_id?: string
  solicitud_id?: string | null
  policy_number?: string | null
  agent_id?: string | null
  dependencia?: string | null
  severity: FindingSeverity
  category: FindingCategory
  rule_code: string            // RuleCode or custom EXPEDIENTE_* string
  status_label: QualityStatusLabel
  title: string
  detail?: string
  evidence?: Record<string, unknown>
  detected_at?: string         // ISO string (set before DB insert)
  resolved_at?: string | null
  resolution_notes?: string | null
}

// ──────────────────────────────────────────────────────────────
// Run scope — mirrors DB quality_runs.scope_payload
// ──────────────────────────────────────────────────────────────
export type RunScopeType = 'policy' | 'agent' | 'date_range' | 'dependencia' | 'team' | 'folio'

export interface RunScope {
  type: RunScopeType
  policy_numbers?: string[]
  agent_ids?: string[]
  from?: string  // ISO date
  to?: string    // ISO date
  dependencia?: string
  folio?: string
}

// ──────────────────────────────────────────────────────────────
// Quality run result
// ──────────────────────────────────────────────────────────────
export interface QualityRunResult {
  run_id: string
  run_type: 'intake' | 'retroactive' | 'on_demand'
  scope: RunScope
  findings: QualityFinding[]
  summary: QualityRunSummary
  action_queue: ActionQueueItem[]
}

export interface QualityRunSummary {
  total_evaluated: number
  hard_stops: number
  flags: number
  infos: number
  by_category: Partial<Record<FindingCategory, number>>
  requires_mario_review: boolean
}

export interface ActionQueueItem {
  priority: 'urgent' | 'high' | 'normal'
  type: 'mario_override_required' | 'ops_fix' | 'agent_clarification' | 'expediente_chase'
  solicitud_id?: string
  policy_number?: string
  folio?: string
  description: string
  rule_code: string
}

// ──────────────────────────────────────────────────────────────
// Email policy event (maps to email_policy_events table — snake_case)
// ──────────────────────────────────────────────────────────────
export type EmailEventType =
  | 'cancellation_signal'
  | 'expediente_issue'
  | 'expediente_complete'

export interface EmailPolicyEvent {
  id?: string
  source_message_id: string
  policy_number: string        // exact match, leading zeros stripped
  event_type: EmailEventType
  matched_phrase?: string
  occurred_at: Date            // Date in memory; ISO string in DB
  raw_subject?: string
  raw_from?: string
  detail?: Record<string, unknown>
}

// ──────────────────────────────────────────────────────────────
// Expediente SLA states
// ──────────────────────────────────────────────────────────────
export type ExpedienteState =
  | 'expediente_clean'
  | 'expediente_issue_open'
  | 'expediente_resolved_in_sla'
  | 'expediente_resolved_late'
  | 'expediente_sla_breached'

// ──────────────────────────────────────────────────────────────
// Cancellation states
// ──────────────────────────────────────────────────────────────
export type CancellationState =
  | 'clean'
  | 'signal_detected'         // email match found — under review
  | 'confirmed'               // confirmed hard stop
  | 'cleared'                 // override or false positive cleared

// ──────────────────────────────────────────────────────────────
// Intake hook result — returned by runIntakeFiltro()
// ──────────────────────────────────────────────────────────────
export interface IntakeFiltroResult {
  blocked: boolean
  findings: QualityFinding[]
  status_label: QualityStatusLabel
  summary_text: string
}

// ──────────────────────────────────────────────────────────────
// Policy quality state (maps to policy_quality_state table)
// ──────────────────────────────────────────────────────────────
export interface PolicyQualityState {
  policy_number: string | null
  solicitud_id?: string | null
  overall_state: string
  hard_stop_count: number
  flag_count: number
  latest_run_id?: string | null
  cancellation_state: CancellationState
  expediente_state: ExpedienteState
  override_required: boolean
  updated_at: Date
}
