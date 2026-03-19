// ============================================================
// Filtro de Calidad v1 — Video Ingestion & Parse Diagnostics
// lib/filtro-calidad/video-ingest.ts
// Created: 2026-03-19
//
// PURPOSE:
//   Granular video ingestion pipeline that distinguishes between:
//     1. DB link missing (docs_video null/empty)
//     2. Storage lookup failure (file not found or error)
//     3. Parse/format failure (corrupt or unsupported file)
//     4. Transcript extraction failure (STT unavailable or failed)
//     5. Frame extraction failure (no usable face frame)
//     6. Statement detection failure (required points not detected)
//
// DESIGN:
//   - Each stage returns a VideoIngestResult describing where it stopped.
//   - Caller (intake-hook / retro-runner) converts the result into a
//     specific QualityFinding using videoIngestResultToFinding().
//   - Storage is Supabase Storage (bucket: solicitud-docs).
//   - Transcription is pluggable (provider env var), defaulting to skipped.
//   - Frame extraction is pluggable (ffmpeg / provider), defaulting to skipped.
//   - Statement detection is keyword-heuristic (no LLM required for v1).
//
// ENV VARS:
//   VIDEO_TRANSCRIPT_PROVIDER   = "openai-whisper" | "none"  (default: "none")
//   VIDEO_FRAME_PROVIDER        = "ffmpeg" | "none"           (default: "none")
//   OPENAI_API_KEY              (for openai-whisper provider)
//
// USAGE:
//   const result = await ingestVideo(storagePath, supabase)
//   const finding = videoIngestResultToFinding(result, solicitudId, policyNumber)
//   if (finding) findings.push(finding)
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QualityFinding, VideoIngestResult, VideoIngestStage, VideoIngestStatus } from './types'
import { RULE_CODES, VIDEO_REQUIRED_POINTS } from './types'

const BUCKET = 'solicitud-docs'
const TRANSCRIPT_PROVIDER = (process.env.VIDEO_TRANSCRIPT_PROVIDER ?? 'none').toLowerCase()
const FRAME_PROVIDER = (process.env.VIDEO_FRAME_PROVIDER ?? 'none').toLowerCase()

// ──────────────────────────────────────────────────────────────
// Stage 1: DB link check
// Returns ok/failed immediately — no I/O needed.
// ──────────────────────────────────────────────────────────────

export function checkVideoDbLink(docsVideo: string | null | undefined): VideoIngestResult {
  if (!docsVideo || docsVideo.trim() === '') {
    return {
      stage: 'db_link_check',
      status: 'failed',
      error: 'docs_video field is null or empty in the database',
      evidence: { docs_video_raw: docsVideo ?? null },
    }
  }
  return {
    stage: 'db_link_check',
    status: 'ok',
    storage_path: docsVideo.trim(),
  }
}

// ──────────────────────────────────────────────────────────────
// Stage 2: Storage lookup
// Downloads the video bytes from Supabase Storage.
// ──────────────────────────────────────────────────────────────

export async function lookupVideoStorage(
  storagePath: string,
  supabase: SupabaseClient
): Promise<VideoIngestResult & { blob?: Blob }> {
  try {
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(storagePath)

    if (error) {
      // Supabase returns 404-like errors as error objects
      const isNotFound =
        error.message?.toLowerCase().includes('not found') ||
        error.message?.toLowerCase().includes('object not found') ||
        error.message?.toLowerCase().includes('404')

      return {
        stage: 'storage_lookup',
        status: 'failed',
        storage_path: storagePath,
        error: isNotFound
          ? `Video file not found in storage: ${storagePath}`
          : `Storage lookup error: ${error.message}`,
        evidence: {
          storage_path: storagePath,
          supabase_error: error.message,
          is_not_found: isNotFound,
        },
      }
    }

    if (!blob || blob.size === 0) {
      return {
        stage: 'storage_lookup',
        status: 'failed',
        storage_path: storagePath,
        error: `Storage returned empty blob for ${storagePath}`,
        evidence: { storage_path: storagePath, blob_size: 0 },
      }
    }

    return {
      stage: 'storage_lookup',
      status: 'ok',
      storage_path: storagePath,
      blob,
      evidence: { blob_size: blob.size, blob_type: blob.type },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      stage: 'storage_lookup',
      status: 'failed',
      storage_path: storagePath,
      error: `Unexpected storage error: ${message}`,
      evidence: { storage_path: storagePath, exception: message },
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Stage 3: Parse / format validation
// Just checks that the blob looks like a video (non-zero, valid MIME).
// ──────────────────────────────────────────────────────────────

export function parseVideoBlob(blob: Blob, storagePath: string): VideoIngestResult & { blob?: Blob } {
  const allowedTypes = ['video/mp4', 'video/quicktime', 'video/mpeg', 'video/webm', 'video/x-msvideo', 'video/3gpp', '']
  const mimeType = blob.type ?? ''

  // If browser reports a type and it's not video-like, flag it
  const isLikelyVideo =
    mimeType === '' || // unknown type — let it pass (storage may not set MIME)
    mimeType.startsWith('video/') ||
    allowedTypes.includes(mimeType)

  if (!isLikelyVideo) {
    return {
      stage: 'parse',
      status: 'failed',
      storage_path: storagePath,
      error: `Unexpected file type: ${mimeType}. Expected a video file.`,
      evidence: { mime_type: mimeType, blob_size: blob.size },
    }
  }

  if (blob.size < 1024) {
    // Under 1 KB is almost certainly not a real video
    return {
      stage: 'parse',
      status: 'failed',
      storage_path: storagePath,
      error: `Video file is too small to be valid (${blob.size} bytes)`,
      evidence: { blob_size: blob.size, mime_type: mimeType },
    }
  }

  return {
    stage: 'parse',
    status: 'ok',
    storage_path: storagePath,
    blob,
    evidence: { mime_type: mimeType, blob_size: blob.size },
  }
}

// ──────────────────────────────────────────────────────────────
// Stage 4: Transcription (pluggable)
// ──────────────────────────────────────────────────────────────

export async function transcribeVideo(
  blob: Blob,
  storagePath: string
): Promise<VideoIngestResult> {
  if (TRANSCRIPT_PROVIDER === 'none') {
    return {
      stage: 'transcript',
      status: 'skipped',
      storage_path: storagePath,
      evidence: { reason: 'VIDEO_TRANSCRIPT_PROVIDER not configured' },
    }
  }

  if (TRANSCRIPT_PROVIDER === 'openai-whisper') {
    return transcribeWithOpenAIWhisper(blob, storagePath)
  }

  return {
    stage: 'transcript',
    status: 'failed',
    storage_path: storagePath,
    error: `Unknown transcript provider: ${TRANSCRIPT_PROVIDER}`,
    evidence: { provider: TRANSCRIPT_PROVIDER },
  }
}

async function transcribeWithOpenAIWhisper(
  blob: Blob,
  storagePath: string
): Promise<VideoIngestResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      stage: 'transcript',
      status: 'failed',
      storage_path: storagePath,
      error: 'OPENAI_API_KEY not set — cannot use openai-whisper provider',
      evidence: { provider: 'openai-whisper' },
    }
  }

  try {
    const formData = new FormData()
    // Whisper needs a filename with extension to infer format
    const ext = storagePath.split('.').pop() || 'mp4'
    formData.append('file', blob, `video.${ext}`)
    formData.append('model', 'whisper-1')
    formData.append('language', 'es')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error')
      return {
        stage: 'transcript',
        status: 'failed',
        storage_path: storagePath,
        error: `OpenAI Whisper API error ${response.status}: ${errorText}`,
        evidence: { provider: 'openai-whisper', status_code: response.status },
      }
    }

    const json = await response.json()
    const transcript: string = json.text ?? ''

    if (!transcript.trim()) {
      return {
        stage: 'transcript',
        status: 'failed',
        storage_path: storagePath,
        error: 'Transcription returned empty text',
        evidence: { provider: 'openai-whisper', raw_response: json },
      }
    }

    return {
      stage: 'transcript',
      status: 'ok',
      storage_path: storagePath,
      transcript,
      evidence: { provider: 'openai-whisper', char_count: transcript.length },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      stage: 'transcript',
      status: 'failed',
      storage_path: storagePath,
      error: `Transcription call failed: ${message}`,
      evidence: { provider: 'openai-whisper', exception: message },
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Stage 5: Frame extraction (pluggable — skipped in v1 if not configured)
// ──────────────────────────────────────────────────────────────

export async function extractVideoFrame(
  blob: Blob,
  storagePath: string
): Promise<VideoIngestResult> {
  if (FRAME_PROVIDER === 'none') {
    return {
      stage: 'frame_extraction',
      status: 'skipped',
      storage_path: storagePath,
      evidence: { reason: 'VIDEO_FRAME_PROVIDER not configured' },
    }
  }

  // Future: implement ffmpeg-based frame extraction
  return {
    stage: 'frame_extraction',
    status: 'failed',
    storage_path: storagePath,
    error: `Frame provider ${FRAME_PROVIDER} not yet implemented`,
    evidence: { provider: FRAME_PROVIDER },
  }
}

// ──────────────────────────────────────────────────────────────
// Stage 6: Statement detection (keyword-heuristic, no LLM needed for v1)
//
// Returns which of the 7 required points are present/absent.
// Intentionally loose — false negatives are worse than false positives here
// (better to flag for manual review than silently pass).
// ──────────────────────────────────────────────────────────────

const POINT_PATTERNS: Record<number, RegExp[]> = {
  1: [
    // Full name: at minimum two words that look like a name
    /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/,
    /mi nombre es/i,
    /me llamo/i,
    /soy\s+[A-ZÁÉÍÓÚÑ]/i,
  ],
  2: [
    // Date mention
    /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i,
    /\b20\d{2}\b/,
    /\bhoy\s+es\b/i,
    /\bfecha\b/i,
  ],
  3: [
    // Agent/seller name
    /agente/i,
    /vendedor/i,
    /promotor/i,
    /asesor/i,
    /representante/i,
  ],
  4: [
    // Explicit acceptance
    /acepto/i,
    /autorizo/i,
    /estoy de acuerdo/i,
    /doy mi consentimiento/i,
    /quiero contratar/i,
    /deseo contratar/i,
  ],
  5: [
    // Amount to deduct
    /\$[\d,]+/,
    /\b\d+\s*(pesos|mxn)\b/i,
    /descuento/i,
    /monto/i,
    /prima/i,
    /cuota/i,
    /descuentan/i,
    /me van a descontar/i,
  ],
  6: [
    // Beneficiaries and percentages
    /beneficiar/i,
    /\b\d+\s*%/,
    /por ciento/i,
    /porcentaje/i,
  ],
  7: [
    // Statement about existing policies
    /no (quiero|deseo) cancelar/i,
    /no cancel/i,
    /mis (otras |otras\s+)?pólizas/i,
    /pólizas (vigentes|actuales|existentes)/i,
    /no afectar/i,
  ],
}

export interface StatementDetectionResult {
  stage: 'statement_detection'
  status: VideoIngestStatus
  points_detected: number[]
  points_missing: number[]
  transcript: string
  evidence?: Record<string, unknown>
}

export function detectVideoStatements(
  transcript: string,
  hasExistingPolicies: boolean
): StatementDetectionResult {
  const pointsToCheck = hasExistingPolicies ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6]
  const detected: number[] = []
  const missing: number[] = []

  for (const point of pointsToCheck) {
    const patterns = POINT_PATTERNS[point] ?? []
    const found = patterns.some((p) => p.test(transcript))
    if (found) detected.push(point)
    else missing.push(point)
  }

  const status: VideoIngestStatus = missing.length === 0 ? 'ok' : 'failed'

  return {
    stage: 'statement_detection',
    status,
    points_detected: detected,
    points_missing: missing,
    transcript,
    evidence: {
      checked_points: pointsToCheck,
      detected_count: detected.length,
      missing_count: missing.length,
      has_existing_policies: hasExistingPolicies,
    },
  }
}

// ──────────────────────────────────────────────────────────────
// Full pipeline: ingestVideo
// Runs all stages in sequence, stopping at first failure.
// ──────────────────────────────────────────────────────────────

export async function ingestVideo(
  docsVideo: string | null | undefined,
  supabase: SupabaseClient,
  options: {
    hasExistingPolicies?: boolean
    skipTranscript?: boolean
    skipFrameExtraction?: boolean
  } = {}
): Promise<VideoIngestResult> {
  // Stage 1: DB link
  const linkResult = checkVideoDbLink(docsVideo)
  if (linkResult.status === 'failed') return linkResult

  const storagePath = linkResult.storage_path!

  // Stage 2: Storage lookup
  const storageResult = await lookupVideoStorage(storagePath, supabase)
  if (storageResult.status === 'failed') return storageResult

  const blob = (storageResult as { blob?: Blob }).blob!

  // Stage 3: Parse
  const parseResult = parseVideoBlob(blob, storagePath)
  if (parseResult.status === 'failed') return parseResult

  // Stage 4: Transcript (optional — skipped if provider=none or skipTranscript)
  let transcript: string | undefined
  if (!options.skipTranscript) {
    const transcriptResult = await transcribeVideo(blob, storagePath)
    if (transcriptResult.status === 'failed') return transcriptResult
    if (transcriptResult.status === 'ok') transcript = transcriptResult.transcript
  }

  // Stage 5: Frame extraction (optional — skipped if provider=none or skipFrameExtraction)
  let frameb64: string | undefined
  if (!options.skipFrameExtraction) {
    const frameResult = await extractVideoFrame(blob, storagePath)
    if (frameResult.status === 'failed') return frameResult
    if (frameResult.status === 'ok') frameb64 = frameResult.frame_b64
  }

  // Stage 6: Statement detection (only if transcript is available)
  if (transcript) {
    const stmtResult = detectVideoStatements(transcript, options.hasExistingPolicies ?? false)
    return {
      stage: stmtResult.points_missing.length > 0 ? 'statement_detection' : 'complete',
      status: stmtResult.status,
      storage_path: storagePath,
      transcript,
      frame_b64: frameb64,
      points_detected: stmtResult.points_detected,
      points_missing: stmtResult.points_missing,
      evidence: {
        ...stmtResult.evidence,
        mime_type: parseResult.evidence?.mime_type,
        blob_size: parseResult.evidence?.blob_size,
      },
    }
  }

  // All stages passed (or skipped where optional)
  return {
    stage: 'complete',
    status: 'ok',
    storage_path: storagePath,
    transcript,
    frame_b64: frameb64,
    evidence: parseResult.evidence,
  }
}

// ──────────────────────────────────────────────────────────────
// Convert VideoIngestResult → QualityFinding
// Returns null when video is clean (stage=complete, status=ok).
// ──────────────────────────────────────────────────────────────

export function videoIngestResultToFinding(
  result: VideoIngestResult,
  solicitudId?: string | null,
  policyNumber?: string | null,
  agentId?: string | null,
  dependencia?: string | null,
  qualityRunId?: string
): QualityFinding | null {
  // Clean — no finding
  if (result.stage === 'complete' && result.status === 'ok') return null
  if (result.status === 'skipped') return null

  const base: Partial<QualityFinding> = {
    quality_run_id: qualityRunId,
    solicitud_id: solicitudId ?? null,
    policy_number: policyNumber ?? null,
    agent_id: agentId ?? null,
    dependencia: dependencia ?? null,
    category: 'doc_authenticity',
    evidence: result.evidence,
    detected_at: new Date().toISOString(),
  }

  const stage: VideoIngestStage = result.stage

  if (stage === 'db_link_check') {
    const isEmpty = (result.evidence?.['docs_video_raw'] ?? null) !== null
    return {
      ...base,
      severity: 'stop',
      rule_code: isEmpty ? RULE_CODES.VIDEO_DB_LINK_MISSING : RULE_CODES.VIDEO_MISSING,
      status_label: 'blocked_doc_authenticity_risk',
      title: isEmpty
        ? 'Video: enlace vacío en base de datos'
        : 'Video: campo docs_video ausente en base de datos',
      detail: result.error,
    } as QualityFinding
  }

  if (stage === 'storage_lookup') {
    const isNotFound = (result.evidence?.['is_not_found'] as boolean | undefined) === true
    return {
      ...base,
      severity: 'stop',
      rule_code: isNotFound ? RULE_CODES.VIDEO_STORAGE_NOT_FOUND : RULE_CODES.VIDEO_STORAGE_ERROR,
      status_label: 'blocked_doc_authenticity_risk',
      title: isNotFound
        ? 'Video: archivo no encontrado en almacenamiento'
        : 'Video: error al consultar almacenamiento',
      detail: result.error,
    } as QualityFinding
  }

  if (stage === 'parse') {
    return {
      ...base,
      severity: 'stop',
      rule_code: RULE_CODES.VIDEO_PARSE_ERROR,
      status_label: 'blocked_doc_authenticity_risk',
      title: 'Video: archivo no válido o corrupto',
      detail: result.error,
    } as QualityFinding
  }

  if (stage === 'transcript') {
    return {
      ...base,
      severity: 'stop',
      rule_code: RULE_CODES.VIDEO_TRANSCRIPT_ERROR,
      status_label: 'pending_manual_review',
      title: 'Video: error en transcripción',
      detail: result.error,
    } as QualityFinding
  }

  if (stage === 'frame_extraction') {
    return {
      ...base,
      severity: 'flag',  // frame failure is a flag (not hard stop), face match falls back to manual review
      rule_code: RULE_CODES.VIDEO_FRAME_EXTRACTION_ERROR,
      status_label: 'pending_manual_review',
      title: 'Video: no se pudo extraer frame para verificación facial',
      detail: result.error,
    } as QualityFinding
  }

  if (stage === 'statement_detection') {
    const missing = result.points_missing ?? []
    const missingDescriptions = missing.map((p) => `Punto ${p}: ${VIDEO_REQUIRED_POINTS[p] ?? 'desconocido'}`)
    return {
      ...base,
      severity: missing.length > 0 ? 'stop' : 'flag',
      rule_code: missing.length > 0
        ? RULE_CODES.VIDEO_INCOMPLETE_POINTS
        : RULE_CODES.VIDEO_STATEMENT_DETECTION_FAILED,
      status_label: missing.length > 0 ? 'blocked_doc_authenticity_risk' : 'pending_manual_review',
      title: `Video: ${missing.length} punto(s) requerido(s) no detectado(s) en transcripción`,
      detail: `Puntos faltantes: ${missingDescriptions.join('; ')}`,
    } as QualityFinding
  }

  // Fallback — should not reach here
  return {
    ...base,
    severity: 'flag',
    rule_code: RULE_CODES.VIDEO_MISSING,
    status_label: 'pending_manual_review',
    title: 'Video: falla desconocida en ingesta',
    detail: result.error ?? `Stage: ${stage}, status: ${result.status}`,
  } as QualityFinding
}
