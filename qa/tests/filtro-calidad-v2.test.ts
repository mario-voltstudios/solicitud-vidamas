/**
 * QA: filtro-calidad-v2.test.ts
 * Tests for: mx-holidays, expediente-sla with holidays, face-match abstractions
 */

import {
  isHolidayMX,
  getHolidaysForYear,
} from '@/lib/filtro-calidad/mx-holidays'

import {
  addBusinessDays,
  countBusinessDays,
  deriveExpedienteState,
  EXPEDIENTE_SLA_BUSINESS_DAYS,
} from '@/lib/filtro-calidad/expediente-sla'

import { compareFaces, faceMatchToFinding } from '@/lib/filtro-calidad/face-match'
import type { EmailPolicyEvent } from '@/lib/filtro-calidad/types'

// ── mx-holidays ───────────────────────────────────────────────────────────────

describe('isHolidayMX', () => {
  it('returns true for Año Nuevo 2026 (Jan 1)', () => {
    expect(isHolidayMX(new Date('2026-01-01T12:00:00Z'))).toBe(true)
  })

  it('returns true for Día de la Independencia 2026 (Sep 16)', () => {
    expect(isHolidayMX(new Date('2026-09-16T00:00:00Z'))).toBe(true)
  })

  it('returns false for a normal Monday (Jan 5, 2026)', () => {
    expect(isHolidayMX(new Date('2026-01-05T00:00:00Z'))).toBe(false)
  })

  it('returns 7 holidays for 2026', () => {
    const holidays2026 = getHolidaysForYear(2026)
    expect(holidays2026.length).toBeGreaterThanOrEqual(7)
  })

  it('returns true for Constitución 2026 (Feb 2)', () => {
    expect(isHolidayMX(new Date('2026-02-02T00:00:00Z'))).toBe(true)
  })
})

// ── addBusinessDays with MX holidays ─────────────────────────────────────────

describe('addBusinessDays with isHolidayMX', () => {
  it('adds 5 business days from Jan 1 2026 (holiday), skipping holiday + weekend', () => {
    // Jan 1 = holiday (skipped), Jan 2=Fri, Jan 3-4=weekend
    // 5 biz days from Jan 1: Jan 2, 5, 6, 7, 8 → deadline = Jan 8
    const start = new Date('2026-01-01T00:00:00Z')
    const deadline = addBusinessDays(start, 5, isHolidayMX)
    expect(deadline.getUTCFullYear()).toBe(2026)
    expect(deadline.getUTCMonth()).toBe(0) // January
    expect(deadline.getUTCDate()).toBe(8)
  })

  it('adds 5 business days normally when no holidays in window', () => {
    // Mar 2 2026 (Monday) → 5 biz days = Mar 6 (Friday) assuming no holidays
    const start = new Date('2026-03-02T00:00:00Z')
    const deadline = addBusinessDays(start, 5, isHolidayMX)
    expect(deadline.getUTCDate()).toBe(9) // Mar 9 (next Mon after skipping weekend)
    // Actually: Mar 3,4,5,6,9 → deadline is Mar 9
    expect(deadline.getUTCMonth()).toBe(2) // March
  })

  it('skips Constitución holiday Feb 2 2026 when in window', () => {
    // Jan 30 2026 (Friday) → normally 5 biz days = Feb 6
    // But Feb 2 (Mon) is holiday → need one extra → Feb 9 (Mon)
    const start = new Date('2026-01-30T00:00:00Z')
    const deadline = addBusinessDays(start, 5, isHolidayMX)
    // Jan 30 (start), biz days: Feb 3 (Tue — Feb 2 is holiday), Feb 4, Feb 5, Feb 6, Feb 9 → Feb 9
    expect(deadline.getUTCMonth()).toBe(1) // February
    expect(deadline.getUTCDate()).toBe(9)
  })
})

// ── deriveExpedienteState with holidays ───────────────────────────────────────

describe('deriveExpedienteState with isHolidayMX', () => {
  function makeEvent(type: EmailPolicyEvent['event_type'], date: string): EmailPolicyEvent {
    return {
      source_message_id: `msg-${date}`,
      policy_number: 'TEST001',
      event_type: type,
      occurred_at: new Date(date),
    }
  }

  it('returns expediente_clean when no events', () => {
    const result = deriveExpedienteState([], new Date(), isHolidayMX)
    expect(result.state).toBe('expediente_clean')
  })

  it('returns expediente_issue_open when issue is recent', () => {
    const issue = makeEvent('expediente_issue', '2026-03-10T10:00:00Z')
    const now = new Date('2026-03-11T10:00:00Z')
    const result = deriveExpedienteState([issue], now, isHolidayMX)
    expect(result.state).toBe('expediente_issue_open')
    expect(result.slaDeadline).toBeDefined()
  })

  it('returns expediente_resolved_in_sla when COMPLETO arrives within 5 biz days', () => {
    const issue = makeEvent('expediente_issue', '2026-03-09T10:00:00Z')
    const complete = makeEvent('expediente_complete', '2026-03-11T10:00:00Z') // 2 biz days later
    const now = new Date('2026-03-17T10:00:00Z')
    const result = deriveExpedienteState([issue, complete], now, isHolidayMX)
    expect(result.state).toBe('expediente_resolved_in_sla')
    expect(result.businessDaysToResolve).toBeLessThanOrEqual(EXPEDIENTE_SLA_BUSINESS_DAYS)
  })

  it('returns expediente_sla_breached when no COMPLETO and deadline passed', () => {
    const issue = makeEvent('expediente_issue', '2026-03-01T10:00:00Z')
    const now = new Date('2026-03-20T10:00:00Z') // well past 5 biz days
    const result = deriveExpedienteState([issue], now, isHolidayMX)
    expect(result.state).toBe('expediente_sla_breached')
  })
})

// ── face-match abstraction ────────────────────────────────────────────────────

describe('compareFaces (no provider configured)', () => {
  beforeAll(() => {
    delete process.env.FACE_MATCH_PROVIDER
  })

  it('returns skipped when no provider is set', async () => {
    const result = await compareFaces('base64imageA', 'base64imageB')
    expect(result.verdict).toBe('skipped')
    expect(result.provider).toBe('none')
  })
})

describe('faceMatchToFinding', () => {
  it('returns null for match verdict', () => {
    const finding = faceMatchToFinding({ verdict: 'match', provider: 'test', score: 0.98 })
    expect(finding).toBeNull()
  })

  it('returns stop finding for mismatch', () => {
    const finding = faceMatchToFinding({ verdict: 'mismatch', provider: 'test', score: 0.72 })
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('stop')
    expect(finding!.rule_code).toBe('FACE_MATCH_MISMATCH')
  })

  it('returns flag finding for inconclusive', () => {
    const finding = faceMatchToFinding({ verdict: 'inconclusive', provider: 'test', error: 'network error' })
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('flag')
    expect(finding!.status_label).toBe('pending_manual_review')
  })

  it('returns flag finding for skipped', () => {
    const finding = faceMatchToFinding({ verdict: 'skipped', provider: 'none' })
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('flag')
    expect(finding!.rule_code).toBe('FACE_MATCH_INCONCLUSIVE')
  })
})
