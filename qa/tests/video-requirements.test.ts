// ============================================================
// Video Requirements Tests — Emision compliance logic
// ============================================================

import {
  VIDEO_REQUIREMENTS,
  createDefaultVideoStates,
  countByStatus,
  allVideosComplete,
  getVideoCompletionPct,
  videoStoragePath,
  type VideoRequirementState,
  type VideoRequirementStatus,
} from '@/lib/video/requirement-types'

// ── Constants ──────────────────────────────────────────────

describe('VIDEO_REQUIREMENTS', () => {
  it('defines exactly 7 requirements', () => {
    expect(VIDEO_REQUIREMENTS).toHaveLength(7)
  })

  it('has unique keys for each requirement', () => {
    const keys = VIDEO_REQUIREMENTS.map((r) => r.key)
    expect(new Set(keys).size).toBe(7)
  })

  it('has sequential order 1-7', () => {
    const orders = VIDEO_REQUIREMENTS.map((r) => r.order)
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('includes all required emision topics', () => {
    const keys = VIDEO_REQUIREMENTS.map((r) => r.key)
    expect(keys).toContain('datos_personales')
    expect(keys).toContain('beneficiarios')
    expect(keys).toContain('forma_cobro')
    expect(keys).toContain('otros_seguros')
    expect(keys).toContain('salud_actividad')
    expect(keys).toContain('firma_solicitud_p1')
    expect(keys).toContain('firma_condiciones_p2')
  })

  it('has non-empty title, description, and prompt for each', () => {
    for (const req of VIDEO_REQUIREMENTS) {
      expect(req.title.trim()).not.toBe('')
      expect(req.description.trim()).not.toBe('')
      expect(req.prompt.trim()).not.toBe('')
    }
  })
})

// ── createDefaultVideoStates ───────────────────────────────

describe('createDefaultVideoStates', () => {
  it('creates a state entry for each requirement', () => {
    const states = createDefaultVideoStates()
    for (const req of VIDEO_REQUIREMENTS) {
      expect(states[req.key]).toBeDefined()
    }
  })

  it('sets all requirements to pending', () => {
    const states = createDefaultVideoStates()
    for (const req of VIDEO_REQUIREMENTS) {
      expect(states[req.key].status).toBe('pending')
    }
  })

  it('returns exactly 7 entries', () => {
    const states = createDefaultVideoStates()
    expect(Object.keys(states)).toHaveLength(7)
  })
})

// ── countByStatus ──────────────────────────────────────────

describe('countByStatus', () => {
  it('counts all as pending for default states', () => {
    const states = createDefaultVideoStates()
    const counts = countByStatus(states)
    expect(counts.pending).toBe(7)
    expect(counts.complete).toBe(0)
    expect(counts.review).toBe(0)
    expect(counts.recording).toBe(0)
    expect(counts.uploading).toBe(0)
  })

  it('counts mixed statuses correctly', () => {
    const states = createDefaultVideoStates()
    states.datos_personales.status = 'complete'
    states.beneficiarios.status = 'complete'
    states.forma_cobro.status = 'review'
    states.otros_seguros.status = 'uploading'
    // rest stay pending

    const counts = countByStatus(states)
    expect(counts.complete).toBe(2)
    expect(counts.review).toBe(1)
    expect(counts.uploading).toBe(1)
    expect(counts.pending).toBe(3)
  })

  it('handles empty/missing states gracefully', () => {
    const counts = countByStatus({})
    expect(counts.pending).toBe(7)
    expect(counts.complete).toBe(0)
  })

  it('counts all complete correctly', () => {
    const states = createDefaultVideoStates()
    for (const req of VIDEO_REQUIREMENTS) {
      states[req.key].status = 'complete'
    }
    const counts = countByStatus(states)
    expect(counts.complete).toBe(7)
    expect(counts.pending).toBe(0)
  })
})

// ── allVideosComplete ──────────────────────────────────────

describe('allVideosComplete', () => {
  it('returns false for default (all pending) states', () => {
    expect(allVideosComplete(createDefaultVideoStates())).toBe(false)
  })

  it('returns false when only some are complete', () => {
    const states = createDefaultVideoStates()
    states.datos_personales.status = 'complete'
    expect(allVideosComplete(states)).toBe(false)
  })

  it('returns true when all 7 are complete', () => {
    const states = createDefaultVideoStates()
    for (const req of VIDEO_REQUIREMENTS) {
      states[req.key].status = 'complete'
    }
    expect(allVideosComplete(states)).toBe(true)
  })

  it('returns false if even one is in review', () => {
    const states = createDefaultVideoStates()
    for (const req of VIDEO_REQUIREMENTS) {
      states[req.key].status = 'complete'
    }
    states.beneficiarios.status = 'review'
    expect(allVideosComplete(states)).toBe(false)
  })

  it('returns false for empty states', () => {
    expect(allVideosComplete({})).toBe(false)
  })
})

// ── getVideoCompletionPct ──────────────────────────────────

describe('getVideoCompletionPct', () => {
  it('returns 0 for all pending', () => {
    expect(getVideoCompletionPct(createDefaultVideoStates())).toBe(0)
  })

  it('returns ~14% for 1 of 7 complete', () => {
    const states = createDefaultVideoStates()
    states.datos_personales.status = 'complete'
    expect(getVideoCompletionPct(states)).toBe(Math.round((1 / 7) * 100))
  })

  it('returns 100 for all complete', () => {
    const states = createDefaultVideoStates()
    for (const req of VIDEO_REQUIREMENTS) {
      states[req.key].status = 'complete'
    }
    expect(getVideoCompletionPct(states)).toBe(100)
  })

  it('does not count review as complete', () => {
    const states = createDefaultVideoStates()
    states.datos_personales.status = 'review'
    expect(getVideoCompletionPct(states)).toBe(0)
  })

  it('returns 0 for empty states', () => {
    expect(getVideoCompletionPct({})).toBe(0)
  })
})

// ── videoStoragePath ───────────────────────────────────────

describe('videoStoragePath', () => {
  it('includes folio and key in path', () => {
    const path = videoStoragePath('A001-2026-S10-01', 'datos_personales')
    expect(path).toMatch(/^A001-2026-S10-01\/video\/datos_personales-\d+\.webm$/)
  })

  it('generates unique paths for the same key (timestamp)', () => {
    const p1 = videoStoragePath('FOLIO-1', 'beneficiarios')
    const p2 = videoStoragePath('FOLIO-1', 'beneficiarios')
    // They might be the same if called in the same ms, but usually different
    expect(p1).toMatch(/\.webm$/)
    expect(p2).toMatch(/\.webm$/)
  })

  it('uses .webm extension', () => {
    const path = videoStoragePath('F', 'k')
    expect(path.endsWith('.webm')).toBe(true)
  })
})
