// ============================================================
// Filtro de Calidad v1 — Cancellation Detection Rules
// lib/filtro-calidad/cancellation-rules.ts
// Created: 2026-03-16
// ============================================================
//
// Responsibilities:
//   1. Given email events for a policy, derive cancellation state
//   2. Produce a QualityFinding when a cancellation signal is present
//
// MATCHING RULES (from bible):
//   - STRONGEST trigger: exact policy number + cancelar/cancelación in email
//   - Person-level linkage (RFC/phone/name) can add REVIEW signals when high-confidence
//     — NOT implemented in v1; reserved for v2 via TODO
// ============================================================

import type { EmailPolicyEvent, QualityFinding, CancellationState } from './types'

export interface CancellationResult {
  state: CancellationState
  signalCount: number
  firstSignalDate?: Date
  evidence?: Record<string, unknown>
}

/**
 * Derive cancellation state for a policy from its email events.
 * 
 * - If any 'cancellation_signal' event exists → 'signal_detected' (hard stop)
 * - No signals → 'clean'
 * - 'confirmed' and 'cleared' are set by Mario override, not computed here
 */
export function deriveCancellationState(
  events: EmailPolicyEvent[]
): CancellationResult {
  const signals = events
    .filter(e => e.event_type === 'cancellation_signal')
    .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime())

  if (signals.length === 0) {
    return { state: 'clean', signalCount: 0 }
  }

  return {
    state: 'signal_detected',
    signalCount: signals.length,
    firstSignalDate: signals[0].occurred_at,
    evidence: {
      signals: signals.map(s => ({
        message_id: s.source_message_id,
        subject: s.raw_subject,
        matched_phrase: s.matched_phrase,
        occurred_at: s.occurred_at.toISOString()
      }))
    }
  }
}

/**
 * Convert a CancellationResult to a QualityFinding.
 * Returns null for clean state.
 */
export function cancellationToFinding(
  policyNumber: string,
  result: CancellationResult,
  solicitudId?: string
): QualityFinding | null {
  if (result.state === 'clean' || result.state === 'cleared') return null

  return {
    solicitud_id: solicitudId ?? null,
    policy_number: policyNumber,
    severity: 'stop',
    category: 'cancellation',
    rule_code: 'EMAIL_CANCEL_EXACT_POLIZA',
    status_label: 'blocked_cancellation_risk',
    title: 'Señal de cancelación detectada por número de póliza exacto',
    detail: `${result.signalCount} email(s) con keywords de cancelación para esta póliza. ` +
      `Primera señal: ${result.firstSignalDate?.toISOString() ?? 'desconocida'}.`,
    evidence: result.evidence ?? {},
    detected_at: new Date().toISOString(),
  }
}

// ----------------------------------------------------------
// TODO v2: Person-level linkage signals
// ----------------------------------------------------------
// When a cancellation email references the same RFC / phone / matrícula
// as a known policy holder but does NOT include the policy number exactly,
// we can still generate a 'flag' (not a 'stop') for manual review.
// 
// Interface sketch (not implemented):
//
// export function personLevelCancellationSignal(
//   email: RawEmailMessage,
//   identityKeys: { rfc?: string; phone?: string; matricula?: string },
//   confidenceThreshold = 0.8
// ): QualityFinding | null
