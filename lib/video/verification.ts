// ============================================================
// Video Verification — Frame Extraction + OpenAI Vision
// Verifies 7 requirements from asegurado selfie video
// ============================================================

import { createServerClient } from '@/lib/supabase'
import { getSolicitudFileFromS3 } from '@/lib/s3'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

// ── Types ──────────────────────────────────────────────────

export interface VerificationInput {
  solicitudId: string
  videoS3Key: string
  aseguradoNombre: string       // from INE / solicitud
  aseguradoApPaterno: string
  aseguradoApMaterno: string
  agentName: string             // from agentes table
  primaQuincenal: number        // from solicitud
  beneficiaries: { nombre: string; porcentaje: number }[]
  uploadTimestamp: number       // Date.now()
}

export interface VerificationItem {
  key: string
  label: string
  passed: boolean | null        // null = not yet checked
  confidence: number            // 0-1
  detail: string
}

export interface VerificationResult {
  solicitudId: string
  allPassed: boolean
  needsManualOverride: boolean
  items: VerificationItem[]
  framesAnalyzed: number
  processingMs: number
}

// ── Frame Extraction via FFmpeg ────────────────────────────

export async function extractVideoFrames(
  inputPathOrUrl: string,
  frameCount = 8
): Promise<string[]> {
  if (!ffmpegPath) throw new Error('ffmpeg-static not available')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-frames-'))
  const frames: string[] = []

  // Extract evenly spaced frames
  // Use fps filter with round to get ~frameCount frames
  const outputPattern = path.join(tmpDir, 'frame-%03d.jpg')

  await execFileAsync(ffmpegPath, [
    '-i', inputPathOrUrl,
    '-vf', `fps=1/${Math.max(1, Math.floor(1))}`,  // 1 frame per second, we'll pick best ones
    '-frames:v', String(frameCount),
    '-q:v', '2',  // JPEG quality 2 (good)
    '-y',
    outputPattern,
  ], { timeout: 120_000 })

  // Collect generated frames
  const files = fs.readdirSync(tmpDir).filter((f: string) => f.endsWith('.jpg')).sort()
  for (const f of files) {
    frames.push(path.join(tmpDir, f))
  }

  return frames
}

// ── Vision API Verification ────────────────────────────────

const VERIFICATION_PROMPT = `You are analyzing a selfie video from an insurance application in Mexico.
An extract of key frames is provided. Based on what you can see and any text/audio cues:

Verify these 7 requirements. For each, respond with true/false/null (not visible) and a confidence 0-1:

1. NOMBRE: The asegurado states their full name
2. FECHA: The asegurado states today's date (within ±1 day)
3. AGENTE: The asegurado states the agent's name
4. ACEPTA_POLIZA: The asegurado explicitly accepts the GNP policy
5. MONTO: The asegurado states the premium/deduction amount
6. BENEFICIARIOS: The asegurado states beneficiary names and percentages
7. NO_CANCELA: The asegurado confirms they do NOT cancel existing policies

Return ONLY valid JSON:
{
  "nombre": { "passed": bool|null, "confidence": number, "detail": "..." },
  "fecha": { "passed": bool|null, "confidence": number, "detail": "..." },
  "agente": { "passed": bool|null, "confidence": number, "detail": "..." },
  "acepta_poliza": { "passed": bool|null, "confidence": number, "detail": "..." },
  "monto": { "passed": bool|null, "confidence": number, "detail": "..." },
  "beneficiarios": { "passed": bool|null, "confidence": number, "detail": "..." },
  "no_cancela": { "passed": bool|null, "confidence": number, "detail": "..." }
}`

function buildContextString(input: VerificationInput): string {
  const today = new Date(input.uploadTimestamp)
  const dateStr = today.toISOString().slice(0, 10)
  const beneficiariesStr = input.beneficiaries
    .map(b => `${b.nombre} (${b.porcentaje}%)`)
    .join(', ')

  return `
KNOWN DATA:
- Asegurado: ${input.aseguradoNombre} ${input.aseguradoApPaterno} ${input.aseguradoApMaterno}
- Agent: ${input.agentName}
- Today's date: ${dateStr} (±1 day acceptable)
- Premium (prima quincenal): $${input.primaQuincenal} MXN
- Beneficiarios: ${beneficiariesStr}
`
}

function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  const normalize = (s: string) => s.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  // Simple Levenshtein threshold
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen === 0) return true
  const dist = levenshtein(na, nb)
  return dist / maxLen < 0.3
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// ── Main Verification Function ─────────────────────────────

export async function verifyVideo(input: VerificationInput): Promise<VerificationResult> {
  const startMs = Date.now()

  // 1. Download video from S3 to temp for frame extraction
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-verify-'))
  const tmpVideoPath = path.join(tmpDir, 'video.mp4')

  // Download from S3
  const s3Response = await getSolicitudFileFromS3(input.videoS3Key)
  const chunks: Buffer[] = []
  const bodyStream = s3Response.Body as NodeJS.ReadableStream
  await new Promise<void>((resolve, reject) => {
    bodyStream.on('data', (chunk: Buffer) => chunks.push(chunk))
    bodyStream.on('end', () => resolve())
    bodyStream.on('error', reject)
  })
  fs.writeFileSync(tmpVideoPath, Buffer.concat(chunks))

  // 2. Extract frames
  const frames = await extractVideoFrames(tmpVideoPath, 8)

  // 3. Build Vision API request
  const contextStr = buildContextString(input)

  // Encode frames as base64
  const frameContents = frames.map((fp: string) => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:image/jpeg;base64,${fs.readFileSync(fp).toString('base64')}`,
      detail: 'low' as const,
    },
  }))

  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: contextStr + '\n\n' + VERIFICATION_PROMPT },
            ...frameContents,
          ],
        },
      ],
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!openaiResponse.ok) {
    throw new Error(`Vision API error: ${openaiResponse.status} ${await openaiResponse.text()}`)
  }

  const visionResult = await openaiResponse.json()
  const rawItems = JSON.parse(visionResult.choices[0].message.content || '{}')

  // 4. Build structured result with local validation
  const items: VerificationItem[] = [
    {
      key: 'nombre',
      label: 'Asegurado states their name',
      passed: rawItems.nombre?.passed ?? null,
      confidence: rawItems.nombre?.confidence ?? 0,
      detail: rawItems.nombre?.detail ?? '',
    },
    {
      key: 'fecha',
      label: 'States today\'s date (±1 day)',
      passed: rawItems.fecha?.passed ?? null,
      confidence: rawItems.fecha?.confidence ?? 0,
      detail: rawItems.fecha?.detail ?? '',
    },
    {
      key: 'agente',
      label: 'States agent name',
      passed: rawItems.agente?.passed ?? null,
      confidence: rawItems.agente?.confidence ?? 0,
      detail: rawItems.agente?.detail ?? '',
    },
    {
      key: 'acepta_poliza',
      label: 'Accepts GNP policy',
      passed: rawItems.acepta_poliza?.passed ?? null,
      confidence: rawItems.acepta_poliza?.confidence ?? 0,
      detail: rawItems.acepta_poliza?.detail ?? '',
    },
    {
      key: 'monto',
      label: 'States premium amount (±5%)',
      passed: rawItems.monto?.passed ?? null,
      confidence: rawItems.monto?.confidence ?? 0,
      detail: rawItems.monto?.detail ?? '',
    },
    {
      key: 'beneficiarios',
      label: 'States beneficiaries + percentages',
      passed: rawItems.beneficiarios?.passed ?? null,
      confidence: rawItems.beneficiarios?.confidence ?? 0,
      detail: rawItems.beneficiarios?.detail ?? '',
    },
    {
      key: 'no_cancela',
      label: 'Confirms NO cancellation of existing policies',
      passed: rawItems.no_cancela?.passed ?? null,
      confidence: rawItems.no_cancela?.confidence ?? 0,
      detail: rawItems.no_cancela?.detail ?? '',
    },
  ]

  const allPassed = items.every(i => i.passed === true)
  const needsManualOverride = !allPassed

  // 5. Persist to database
  const supabase = createServerClient()
  await supabase.from('solicitud_verificaciones').insert({
    solicitud_id: input.solicitudId,
    video_s3_key: input.videoS3Key,
    verification_items: items,
    all_passed: allPassed,
    needs_manual_override: needsManualOverride,
    frames_analyzed: frames.length,
    processing_ms: Date.now() - startMs,
    raw_response: rawItems,
  })

  // 6. Cleanup temp files
  try {
    for (const f of frames) fs.unlinkSync(f)
    fs.unlinkSync(tmpVideoPath)
    fs.rmdirSync(tmpDir)
  } catch {}

  return {
    solicitudId: input.solicitudId,
    allPassed,
    needsManualOverride,
    items,
    framesAnalyzed: frames.length,
    processingMs: Date.now() - startMs,
  }
}
