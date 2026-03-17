// ============================================================
// Filtro de Calidad v1 — Expediente Digital SLA Tracker
// lib/filtro-calidad/expediente-sla.ts
// Created: 2026-03-16
// ============================================================
//
// Responsibilities:
//   1. Given a list of EmailPolicyEvent for one policy, derive ExpedienteState
//   2. Compute 5-business-day SLA deadline from issue_open date
//   3. Determine if COMPLETO arrived in time, late, or not at all
//
// SLA RULE (from bible):
//   - Trigger:  email with exact policy number + "expediente" keyword
//   - Window:   5 business days from issue email date
//   - Recovery: a later email with same policy number + COMPLETO keyword
//   - States:
//       expediente_clean             — no issue email detected
//       expediente_issue_open        — issue detected, SLA still running
//       expediente_resolved_in_sla   — COMPLETO arrived within 5 biz days
//       expediente_resolved_late     — COMPLETO arrived but after SLA
//       expediente_sla_breached      — no COMPLETO, SLA window has passed
//
// MEXICAN HOLIDAYS:
//   This module uses isHolidayMX from mx-holidays.ts by default.
//   Pass a custom holidayChecker to override (e.g. in tests).
// ============================================================

import type { EmailPolicyEvent, ExpedienteState } from './types'
import { isHolidayMX } from './mx-holidays'

// ----------------------------------------------------------
// Business day calculation
// ----------------------------------------------------------

/** Default holiday checker: uses Mexican federal holidays */
const defaultIsHoliday = isHolidayMX

/**
 * Add N business days to a date, skipping weekends and holidays.
 * Returns a new Date at end-of-day (23:59:59) of the Nth business day.
 */
export function addBusinessDays(
  startDate: Date,
  days: number,
  isHoliday: (d: Date) => boolean = defaultIsHoliday
): Date {
  let count = 0
  const result = new Date(startDate)
  while (count < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay() // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6 && !isHoliday(result)) {
      count++
    }
  }
  // Set to end of day
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * Count business days between two dates (exclusive of start, inclusive of end).
 */
export function countBusinessDays(
  from: Date,
  to: Date,
  isHoliday: (d: Date) => boolean = defaultIsHoliday
): number {
  let count = 0
  const cursor = new Date(from)
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1)
    const dow = cursor.getDay()
    if (dow !== 0 && dow !== 6 && !isHoliday(cursor)) {
      count++
    }
  }
  return count
}

// ----------------------------------------------------------
// SLA constants
// ----------------------------------------------------------
export const EXPEDIENTE_SLA_BUSINESS_DAYS = 5

// ----------------------------------------------------------
// Main SLA derivation
// ----------------------------------------------------------

export interface ExpedienteSlaResult {
  state: ExpedienteState
  issueDate?: Date
  slaDeadline?: Date
  completeDate?: Date
  businessDaysToResolve?: number
}

/**
 * Derive the current expediente SLA state for a policy,
 * given all email events for that policy (in any order).
 *
 * @param events - All EmailPolicyEvent rows for this policy
 * @param now    - Reference "now" (injectable for testing)
 * @param isHoliday - Optional holiday function
 */
export function deriveExpedienteState(
  events: EmailPolicyEvent[],
  now: Date = new Date(),
  isHoliday: (d: Date) => boolean = defaultIsHoliday
): ExpedienteSlaResult {
  // Filter to expediente events only
  const issues = events
    .filter(e => e.event_type === 'expediente_issue')
    .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime())

  const completes = events
    .filter(e => e.event_type === 'expediente_complete')
    .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime())

  // No issue detected — clean
  if (issues.length === 0) {
    return { state: 'expediente_clean' }
  }

  // Take the FIRST issue event as the trigger
  const firstIssue = issues[0]
  const issueDate = firstIssue.occurred_at
  const slaDeadline = addBusinessDays(issueDate, EXPEDIENTE_SLA_BUSINESS_DAYS, isHoliday)

  // Find the first COMPLETO that came after the issue
  const firstComplete = completes.find(e => e.occurred_at > issueDate)

  if (!firstComplete) {
    // No COMPLETO found yet
    if (now > slaDeadline) {
      return { state: 'expediente_sla_breached', issueDate, slaDeadline }
    }
    return { state: 'expediente_issue_open', issueDate, slaDeadline }
  }

  const completeDate = firstComplete.occurred_at
  const bizDays = countBusinessDays(issueDate, completeDate, isHoliday)

  if (completeDate <= slaDeadline) {
    return {
      state: 'expediente_resolved_in_sla',
      issueDate,
      slaDeadline,
      completeDate,
      businessDaysToResolve: bizDays
    }
  }

  return {
    state: 'expediente_resolved_late',
    issueDate,
    slaDeadline,
    completeDate,
    businessDaysToResolve: bizDays
  }
}

// ----------------------------------------------------------
// Quality finding factory for expediente states
// ----------------------------------------------------------
import type { QualityFinding } from './types'

/**
 * Convert an ExpedienteSlaResult into a QualityFinding (if it needs one).
 * Returns null for clean or resolved-in-SLA states.
 */
export function expedienteSlaToFinding(
  policyNumber: string,
  result: ExpedienteSlaResult,
  solicitudId?: string
): QualityFinding | null {
  const { state } = result

  if (state === 'expediente_clean' || state === 'expediente_resolved_in_sla') {
    return null
  }

  const severityMap: Record<ExpedienteState, QualityFinding['severity']> = {
    expediente_clean: 'info',
    expediente_issue_open: 'stop',
    expediente_resolved_in_sla: 'info',
    expediente_resolved_late: 'stop',
    expediente_sla_breached: 'stop'
  }

  const titleMap: Record<ExpedienteState, string> = {
    expediente_clean: '',
    expediente_issue_open: 'Expediente Digital — Issue Abierto (SLA corriendo)',
    expediente_resolved_in_sla: '',
    expediente_resolved_late: 'Expediente Digital — Resuelto Fuera de SLA',
    expediente_sla_breached: 'Expediente Digital — SLA Vencido (5 días hábiles)'
  }

  return {
    solicitud_id: solicitudId ?? null,
    policy_number: policyNumber,
    severity: severityMap[state],
    category: 'expediente',
    rule_code: `EXPEDIENTE_${state.toUpperCase()}`,
    status_label: state === 'expediente_issue_open' ? 'blocked_cancellation_risk' : 'retroactive_urgent',
    title: titleMap[state],
    detail: result.slaDeadline
      ? `SLA deadline: ${result.slaDeadline.toISOString()}. ` +
        (result.businessDaysToResolve !== undefined
          ? `Resuelto en ${result.businessDaysToResolve} días hábiles.`
          : 'Sin resolución.')
      : undefined,
    evidence: {
      issue_date: result.issueDate?.toISOString(),
      sla_deadline: result.slaDeadline?.toISOString(),
      complete_date: result.completeDate?.toISOString(),
      business_days_to_resolve: result.businessDaysToResolve
    },
    detected_at: new Date().toISOString(),
  }
}
