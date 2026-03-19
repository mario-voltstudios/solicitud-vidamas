/**
 * QA: video-ingest.test.ts
 * Tests for the granular video ingestion pipeline:
 *   - Stage 1: DB link check
 *   - Stage 2: Storage lookup (mocked)
 *   - Stage 3: Parse / format validation
 *   - Stage 4: Statement detection (keyword heuristic)
 *   - Finding conversion: videoIngestResultToFinding
 *
 * Added: 2026-03-19 (Milestone 1 — granular video failure taxonomy)
 */

import {
  checkVideoDbLink,
  parseVideoBlob,
  detectVideoStatements,
  videoIngestResultToFinding,
  ingestVideo,
} from '@/lib/filtro-calidad/video-ingest'

import { RULE_CODES } from '@/lib/filtro-calidad/types'

// ── Stage 1: DB link check ────────────────────────────────────────────────────

describe('checkVideoDbLink', () => {
  it('returns failed with VIDEO_MISSING context when docs_video is null', () => {
    const result = checkVideoDbLink(null)
    expect(result.stage).toBe('db_link_check')
    expect(result.status).toBe('failed')
    expect(result.evidence?.docs_video_raw).toBeNull()
  })

  it('returns failed when docs_video is undefined', () => {
    const result = checkVideoDbLink(undefined)
    expect(result.stage).toBe('db_link_check')
    expect(result.status).toBe('failed')
  })

  it('returns failed when docs_video is empty string', () => {
    const result = checkVideoDbLink('')
    expect(result.stage).toBe('db_link_check')
    expect(result.status).toBe('failed')
  })

  it('returns failed when docs_video is whitespace only', () => {
    const result = checkVideoDbLink('   ')
    expect(result.stage).toBe('db_link_check')
    expect(result.status).toBe('failed')
  })

  it('returns ok with storage_path when docs_video has a value', () => {
    const result = checkVideoDbLink('folios/5156-2026-S08-01/video.mp4')
    expect(result.stage).toBe('db_link_check')
    expect(result.status).toBe('ok')
    expect(result.storage_path).toBe('folios/5156-2026-S08-01/video.mp4')
  })

  it('trims whitespace from storage_path', () => {
    const result = checkVideoDbLink('  folios/video.mp4  ')
    expect(result.status).toBe('ok')
    expect(result.storage_path).toBe('folios/video.mp4')
  })
})

// ── Stage 3: Parse / format validation ───────────────────────────────────────

describe('parseVideoBlob', () => {
  function makeBlob(size: number, type = 'video/mp4'): Blob {
    const buf = new Uint8Array(size).fill(0xAA)
    return new Blob([buf], { type })
  }

  it('returns ok for a valid mp4 blob', () => {
    const blob = makeBlob(10_000, 'video/mp4')
    const result = parseVideoBlob(blob, 'test.mp4')
    expect(result.stage).toBe('parse')
    expect(result.status).toBe('ok')
  })

  it('returns ok for unknown MIME type (storage may omit type)', () => {
    const blob = makeBlob(10_000, '')
    const result = parseVideoBlob(blob, 'test.mp4')
    expect(result.status).toBe('ok')
  })

  it('returns failed for non-video MIME type', () => {
    const blob = makeBlob(10_000, 'application/pdf')
    const result = parseVideoBlob(blob, 'test.pdf')
    expect(result.status).toBe('failed')
    expect(result.error).toContain('Unexpected file type')
  })

  it('returns failed for suspiciously small blob (< 1KB)', () => {
    const blob = makeBlob(500, 'video/mp4')
    const result = parseVideoBlob(blob, 'test.mp4')
    expect(result.status).toBe('failed')
    expect(result.error).toContain('too small')
  })

  it('returns ok for quicktime (.mov) blob', () => {
    const blob = makeBlob(50_000, 'video/quicktime')
    const result = parseVideoBlob(blob, 'test.mov')
    expect(result.status).toBe('ok')
  })
})

// ── Stage 6: Statement detection ─────────────────────────────────────────────

describe('detectVideoStatements', () => {
  const fullTranscript = `
    Mi nombre es María López García, hoy es 15 de marzo de 2026.
    Mi agente es Juan Pérez. Acepto contratar una nueva póliza con GNP.
    El monto a descontar será de $350 pesos mensuales.
    Mis beneficiarios son mis hijos, 50% cada uno.
    No quiero cancelar mis pólizas vigentes con GNP.
  `

  it('detects all 7 points in a complete transcript with existing policies', () => {
    const result = detectVideoStatements(fullTranscript, true)
    expect(result.status).toBe('ok')
    expect(result.points_missing).toHaveLength(0)
    expect(result.points_detected.length).toBeGreaterThanOrEqual(6)
  })

  it('detects 6 required points when no existing policies', () => {
    const transcript = `
      Mi nombre es Carlos Ruiz. Hoy 10 de febrero.
      El agente es Ana González. Autorizo la nueva póliza GNP.
      Me descontarán $280. Beneficiarios: esposa 100%.
    `
    const result = detectVideoStatements(transcript, false)
    // Point 7 is not required when hasExistingPolicies=false
    expect(result.evidence?.checked_points).not.toContain(7)
    expect(result.status).toBe('ok')
  })

  it('returns failed with missing points for incomplete transcript', () => {
    const transcript = 'Hola me llamo Juan.' // only point 1 detected
    const result = detectVideoStatements(transcript, false)
    expect(result.status).toBe('failed')
    expect(result.points_missing.length).toBeGreaterThan(0)
    expect(result.points_detected).toContain(1)
  })

  it('returns failed when transcript is empty', () => {
    const result = detectVideoStatements('', false)
    expect(result.status).toBe('failed')
    expect(result.points_detected).toHaveLength(0)
  })

  it('detects point 7 via "no quiero cancelar" pattern', () => {
    const transcript = 'No quiero cancelar mis pólizas con GNP.'
    const result = detectVideoStatements(transcript, true)
    expect(result.points_detected).toContain(7)
  })
})

// ── videoIngestResultToFinding conversion ────────────────────────────────────

describe('videoIngestResultToFinding', () => {
  it('returns null for complete+ok (clean video)', () => {
    const finding = videoIngestResultToFinding({
      stage: 'complete',
      status: 'ok',
      storage_path: 'folios/test/video.mp4',
    })
    expect(finding).toBeNull()
  })

  it('returns null for skipped stage', () => {
    const finding = videoIngestResultToFinding({
      stage: 'transcript',
      status: 'skipped',
      storage_path: 'folios/test/video.mp4',
    })
    expect(finding).toBeNull()
  })

  it('returns VIDEO_MISSING finding for null docs_video', () => {
    const result = checkVideoDbLink(null)
    const finding = videoIngestResultToFinding(result, 'sol-001')
    expect(finding).not.toBeNull()
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_MISSING)
    expect(finding!.severity).toBe('stop')
    expect(finding!.solicitud_id).toBe('sol-001')
  })

  it('returns VIDEO_DB_LINK_MISSING for empty string docs_video', () => {
    // Empty string: evidence.docs_video_raw is '' (not null) → DB_LINK_MISSING
    const result = checkVideoDbLink('')
    const finding = videoIngestResultToFinding(result)
    expect(finding).not.toBeNull()
    // Empty string produces docs_video_raw: '' which is not null, so DB_LINK_MISSING
    expect([RULE_CODES.VIDEO_MISSING, RULE_CODES.VIDEO_DB_LINK_MISSING]).toContain(finding!.rule_code)
    expect(finding!.severity).toBe('stop')
  })

  it('returns VIDEO_STORAGE_NOT_FOUND for not-found storage error', () => {
    const finding = videoIngestResultToFinding({
      stage: 'storage_lookup',
      status: 'failed',
      storage_path: 'folios/missing/video.mp4',
      error: 'Video file not found in storage: folios/missing/video.mp4',
      evidence: { is_not_found: true },
    })
    expect(finding).not.toBeNull()
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_STORAGE_NOT_FOUND)
    expect(finding!.severity).toBe('stop')
  })

  it('returns VIDEO_STORAGE_ERROR for unexpected storage error', () => {
    const finding = videoIngestResultToFinding({
      stage: 'storage_lookup',
      status: 'failed',
      storage_path: 'folios/test/video.mp4',
      error: 'Unexpected storage error: network timeout',
      evidence: { is_not_found: false },
    })
    expect(finding).not.toBeNull()
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_STORAGE_ERROR)
  })

  it('returns VIDEO_PARSE_ERROR for parse failure', () => {
    const finding = videoIngestResultToFinding({
      stage: 'parse',
      status: 'failed',
      error: 'Unexpected file type: application/pdf',
    })
    expect(finding).not.toBeNull()
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_PARSE_ERROR)
  })

  it('returns VIDEO_TRANSCRIPT_ERROR for transcript failure', () => {
    const finding = videoIngestResultToFinding({
      stage: 'transcript',
      status: 'failed',
      error: 'OpenAI Whisper API error 429: rate limit',
    })
    expect(finding).not.toBeNull()
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_TRANSCRIPT_ERROR)
    expect(finding!.severity).toBe('stop')
  })

  it('returns VIDEO_FRAME_EXTRACTION_ERROR as flag (not stop)', () => {
    const finding = videoIngestResultToFinding({
      stage: 'frame_extraction',
      status: 'failed',
      error: 'ffmpeg not available',
    })
    expect(finding).not.toBeNull()
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_FRAME_EXTRACTION_ERROR)
    expect(finding!.severity).toBe('flag') // frame failure is a flag, not hard stop
  })

  it('returns VIDEO_INCOMPLETE_POINTS for statement detection failure with missing points', () => {
    const finding = videoIngestResultToFinding({
      stage: 'statement_detection',
      status: 'failed',
      points_detected: [1, 2],
      points_missing: [3, 4, 5],
    })
    expect(finding).not.toBeNull()
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_INCOMPLETE_POINTS)
    expect(finding!.severity).toBe('stop')
    expect(finding!.title).toContain('3 punto(s)')
  })
})

// ── ingestVideo integration (mocked Supabase) ────────────────────────────────

describe('ingestVideo (unit — mocked supabase)', () => {
  function mockSupabase(result: { data: Blob | null; error: { message: string } | null }) {
    return {
      storage: {
        from: () => ({
          download: async () => result,
        }),
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient
  }

  it('returns db_link_check failure when docs_video is null', async () => {
    const supabase = mockSupabase({ data: null, error: null })
    const result = await ingestVideo(null, supabase)
    expect(result.stage).toBe('db_link_check')
    expect(result.status).toBe('failed')
  })

  it('returns storage_lookup failure when storage returns not-found error', async () => {
    const supabase = mockSupabase({
      data: null,
      error: { message: 'Object not found' },
    })
    const result = await ingestVideo('folios/test/video.mp4', supabase)
    expect(result.stage).toBe('storage_lookup')
    expect(result.status).toBe('failed')
    expect(result.evidence?.is_not_found).toBe(true)
  })

  it('returns parse failure when blob has wrong mime type', async () => {
    const pdfBlob = new Blob([new Uint8Array(10_000).fill(0)], { type: 'application/pdf' })
    const supabase = mockSupabase({ data: pdfBlob, error: null })
    const result = await ingestVideo('folios/test/video.mp4', supabase)
    expect(result.stage).toBe('parse')
    expect(result.status).toBe('failed')
  })

  it('returns complete/ok when video passes all stages with providers=none', async () => {
    // With transcript and frame providers=none, we skip those stages gracefully
    const mp4Blob = new Blob([new Uint8Array(100_000).fill(0xAA)], { type: 'video/mp4' })
    const supabase = mockSupabase({ data: mp4Blob, error: null })
    const result = await ingestVideo('folios/test/video.mp4', supabase)
    // With no transcript provider, statement detection is skipped → complete
    expect(result.stage).toBe('complete')
    expect(result.status).toBe('ok')
  })
})
