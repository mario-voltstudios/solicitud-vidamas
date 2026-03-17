// ⚠️  DEPRECATED 2026-03-17 — canonical copy is lib/filtro-calidad/types.ts
// This file is kept only for git history.

// ============================================================
// Filtro de Calidad v1 — TypeScript Types
// Created: 2026-03-16
// ============================================================

// ──────────────────────────────────────────────────────────────
// Rule codes — one constant per rule, maps to DB rule_code column
// ──────────────────────────────────────────────────────────────
export const RULE_CODES = {
  // Seller / video
  SELLER_NAME_MISSING: 'SELLER_NAME_MISSING',
  SELLER_NAME_MISMATCH: 'SELLER_NAME_MISMATCH',

  // Video completeness (7 required points)
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
  PAYROLL_IMSS_STRICT_FORMULA: 'PAYROLL_IMSS_STRICT_FORMULA', // flag-only

  // Expediente Digital
  EXPEDIENTE_ISSUE_OPEN: 'EXPEDIENTE_ISSUE_OPEN',
  EXPEDIENTE_SLA_BREACHED: 'EXPEDIENTE_SLA_BREACHED',
  EXPEDIENTE_RESOLVED_LATE: 'EXPEDIENTE_RESOLVED_LATE',

  // Cancellation email signal
  CANCELLATION_EMAIL_MATCH: 'CANCELLATION_EMAIL_MATCH',

  // Face match
  FACE_MATCH_INCONCLUSIVE: 'FACE_MATCH_INCONCLUSIVE',
  FACE_MATCH_MISMATCH: 'FACE_MATCH_MISMATCH',

  // Dependency requirements
  MISSING_REQUIRED_DOC: 'MISSING_REQUIRED_DOC',
  DEPENDENCY_LEGAL_BLOCKER: 'DEPENDENCY_LEGAL_BLOCKER',
} as const

export type RuleCode = (typeof RULE_CODES)[keyof typeof RULE_CODES]

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
// Finding categories
// ──────────────────────────────────────────────────────────────
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
// Core finding type (mirrors DB row)
// ──────────────────────────────────────────────────────────────
export interface QualityFinding {
  id?: string
  quality_run_id?: string
  solicitud_id?: string
  policy_number?: string
  agent_id?: string
  dependencia?: string
  severity: 'stop' | 'flag' | 'info'
  category: FindingCategory
  rule_code: RuleCode
  status_label: QualityStatusLabel
  title: string
  detail?: string
  evidence?: Record<string, unknown>
  detected_at?: string
  resolved_at?: string
  resolution_notes?: string
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
  rule_code: RuleCode
}

// ──────────────────────────────────────────────────────────────
// Expediente states
// ──────────────────────────────────────────────────────────────
export type ExpedienteState =
  | 'expediente_clean'
  | 'expediente_issue_open'
  | 'expediente_resolved_in_sla'
  | 'expediente_resolved_late'
  | 'expediente_sla_breached'

// ──────────────────────────────────────────────────────────────
// Intake hook result — returned by runIntakeFiltro()
// ──────────────────────────────────────────────────────────────
export interface IntakeFiltroResult {
  blocked: boolean
  findings: QualityFinding[]
  status_label: QualityStatusLabel
  summary_text: string
}