// ============================================================
// Filtro de Calidad v1 — Email Intelligence
// lib/filtro-calidad/email-intel.ts
// Created: 2026-03-16
// ============================================================
//
// Responsibilities:
//   1. Parse a raw Gmail message and extract EmailPolicyEvent(s)
//   2. Detect exact-policy-number cancellation signals
//   3. Detect exact-policy-number expediente issue + COMPLETO signals
//
// STRICT MATCHING RULES (from bible):
//   - Policy number must appear EXACTLY in subject or body
//   - Cancellation keywords: cancelar / cancelación / cancelacion (both accented forms)
//   - Expediente: policy + "expediente" keyword present
//   - COMPLETO: policy + "COMPLETO" or "completo" keyword present
//
// This module is pure / side-effect-free. Callers persist events.
// ============================================================

import type { EmailPolicyEvent, EmailEventType } from './types'

// ----------------------------------------------------------
// Keyword patterns
// ----------------------------------------------------------

/** Matches "cancelar" or "cancelaci[oó]n" (case-insensitive, accent-tolerant) */
const CANCEL_PATTERN = /cancelaci[oó]n|cancelar/i

/** Matches "expediente" (case-insensitive) */
const EXPEDIENTE_PATTERN = /expediente/i

/** Matches "COMPLETO" or "completo" */
const COMPLETO_PATTERN = /completo/i

// ----------------------------------------------------------
// Policy number extraction
// ----------------------------------------------------------
// GNP policy numbers look like digits (e.g. 123456789) or alphanumeric with
// optional dashes. We do NOT know the exact format, so we:
//   a) accept an explicit policyNumber argument for targeted parse, OR
//   b) scan for known patterns
//
// For targeted parse (preferred), the caller passes the policy number and we
// verify it appears literally in the text.

/**
 * Check if a text literally contains a given policy number.
 * Uses word-boundary matching to avoid partial matches.
 */
export function textContainsPolicyNumber(text: string, policyNumber: string): boolean {
  // Escape regex special chars in policy number, then word-boundary match
  const escaped = policyNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`)
  return re.test(text)
}

// ----------------------------------------------------------
// Main parser: given a Gmail message, extract zero or more events
// for a specific (known) policy number.
// ----------------------------------------------------------

export interface RawEmailMessage {
  messageId: string
  subject: string
  from: string
  body: string
  receivedAt: Date
}

/**
 * Parse a single email for signals related to a known policy number.
 * Returns an array (usually 0–1 items) of EmailPolicyEvent.
 *
 * Called from the email ingestion job for each new Gmail message.
 */
export function parseEmailForPolicy(
  msg: RawEmailMessage,
  policyNumber: string
): EmailPolicyEvent[] {
  const combined = `${msg.subject}\n${msg.body}`

  // STRICT: policy number must appear in email
  if (!textContainsPolicyNumber(combined, policyNumber)) return []

  const events: EmailPolicyEvent[] = []

  // --- Expediente COMPLETO (check before issue — more specific) ---
  if (EXPEDIENTE_PATTERN.test(combined) && COMPLETO_PATTERN.test(combined)) {
    events.push({
      source_message_id: msg.messageId,
      policy_number: policyNumber,
      event_type: 'expediente_complete',
      matched_phrase: extractMatchedPhrase(combined, COMPLETO_PATTERN),
      occurred_at: msg.receivedAt,
      raw_subject: msg.subject,
      raw_from: msg.from,
      detail: {}
    })
    return events // COMPLETO supersedes issue detection for same email
  }

  // --- Expediente ISSUE ---
  if (EXPEDIENTE_PATTERN.test(combined)) {
    events.push({
      source_message_id: msg.messageId,
      policy_number: policyNumber,
      event_type: 'expediente_issue',
      matched_phrase: extractMatchedPhrase(combined, EXPEDIENTE_PATTERN),
      occurred_at: msg.receivedAt,
      raw_subject: msg.subject,
      raw_from: msg.from,
      detail: {}
    })
  }

  // --- Cancellation signal ---
  if (CANCEL_PATTERN.test(combined)) {
    events.push({
      source_message_id: msg.messageId,
      policy_number: policyNumber,
      event_type: 'cancellation_signal',
      matched_phrase: extractMatchedPhrase(combined, CANCEL_PATTERN),
      occurred_at: msg.receivedAt,
      raw_subject: msg.subject,
      raw_from: msg.from,
      detail: {}
    })
  }

  return events
}

/**
 * Scan a batch of emails against a SET of known policy numbers.
 * Returns all detected events, keyed by policy number.
 *
 * Useful for retroactive ingestion of a Gmail window.
 */
export function scanEmailsForPolicies(
  messages: RawEmailMessage[],
  policyNumbers: string[]
): Map<string, EmailPolicyEvent[]> {
  const result = new Map<string, EmailPolicyEvent[]>()
  for (const msg of messages) {
    for (const pn of policyNumbers) {
      const events = parseEmailForPolicy(msg, pn)
      if (events.length > 0) {
        const existing = result.get(pn) ?? []
        result.set(pn, [...existing, ...events])
      }
    }
  }
  return result
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------
function extractMatchedPhrase(text: string, pattern: RegExp): string {
  const match = text.match(pattern)
  return match ? match[0] : ''
}
