// ============================================================
// Filtro de Calidad v1 — Video Tamper / AI-Edit Detection
// lib/filtro-calidad/video-tamper.ts
// Created: 2026-03-19
//
// PURPOSE:
//   Produce an evidence-based tamper risk assessment for consent videos.
//   This is NOT forensic certainty — it generates risk signals that
//   Mario can use to decide whether manual review is needed.
//
// APPROACH:
//   Heuristic signals derived from the transcript text:
//     1. Silence / filler ratio — suspiciously clean speech patterns
//     2. Repetitive phrasing — exact legal phrases that are copy-pasted
//     3. Temporal coherence — does the date mentioned match submission date?
//     4. Unnatural punctuation density — STT artifacts from AI TTS
//     5. Missing hesitation markers — human speech has "um/eh/bueno"
//     6. Very short duration proxy — transcript too short for real consent
//
//   If VIDEO_OPENAI_VISION_KEY is set, also sends a sampled frame to
//   GPT-4o Vision for a "does this look like a real person speaking?" check.
//
// HONEST LABELS:
//   tamper_risk: 'low'           — no signals detected
//              'inconclusive'   — 1 signal (not conclusive on its own)
//              'suspicious'     — 2+ signals compound risk → manual review
//   Never claims certainty of AI generation or editing.
//
// RULE CODES produced:
//   VIDEO_TAMPER_SUSPICIOUS     — 2+ signals → flag/manual_review
//   VIDEO_TAMPER_INCONCLUSIVE   — 1 signal → info note
//   VIDEO_TAMPER_NOT_EVALUATED  — no transcript available
// ============================================================

import type { TamperSignal, QualityFinding } from './types'
import { RULE_CODES } from './types'

// ----------------------------------------------------------
// Signal detection helpers
// ----------------------------------------------------------

/**
 * Signal 1: Lack of natural hesitation markers.
 * Human speech in Spanish contains: "bueno", "este", "pues", "eh", "mmm", "o sea"
 * AI-generated TTS typically omits all of these.
 */
function detectLackOfHesitation(text: string): TamperSignal | null {
  const hesitationMarkers = /\b(bueno|este|pues|eh|mmm|o sea|es que|a ver|mira|oye|entonces)\b/gi
  const matches = text.match(hesitationMarkers) ?? []
  const wordCount = text.split(/\s+/).length

  // If text has 100+ words but NO hesitation markers — suspicious
  if (wordCount >= 100 && matches.length === 0) {
    return {
      signal: 'no_hesitation_markers',
      description: 'No se detectaron marcadores de vacilación natural en el habla (bueno, este, pues, eh)',
      severity: 'medium',
      value: `${wordCount} palabras, 0 marcadores`,
    }
  }
  return null
}

/**
 * Signal 2: Exact legal phrase repetition.
 * Scripted/copy-pasted consent reads the same phrase verbatim.
 * We check for unusually long repeated n-gram sequences.
 */
function detectExactPhraseRepetition(text: string): TamperSignal | null {
  // Split into 5-word ngrams
  const words = text.toLowerCase().split(/\s+/)
  if (words.length < 20) return null

  const ngrams = new Map<string, number>()
  for (let i = 0; i <= words.length - 5; i++) {
    const gram = words.slice(i, i + 5).join(' ')
    ngrams.set(gram, (ngrams.get(gram) ?? 0) + 1)
  }

  const repeats = [...ngrams.entries()].filter(([, count]) => count >= 2)
  if (repeats.length >= 2) {
    return {
      signal: 'exact_phrase_repetition',
      description: 'Se detectaron frases exactas repetidas (posible texto copiado/generado)',
      severity: 'medium',
      value: `${repeats.length} secuencias de 5 palabras repetidas`,
    }
  }
  return null
}

/**
 * Signal 3: Suspiciously perfect sentence structure.
 * Human consent usually has run-on sentences or fragments.
 * Count periods + sentences — if very high ratio, suspicious.
 */
function detectUnnaturalStructure(text: string): TamperSignal | null {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  const wordCount = text.split(/\s+/).length
  if (sentences.length < 3) return null

  const avgWordsPerSentence = wordCount / sentences.length
  // Very short sentences (avg < 6 words) in a long text = suspiciously clipped
  if (avgWordsPerSentence < 6 && wordCount >= 80) {
    return {
      signal: 'unnatural_sentence_structure',
      description: 'Estructura de oraciones inusualmente corta para texto hablado (posible TTS)',
      severity: 'low',
      value: `${avgWordsPerSentence.toFixed(1)} palabras promedio por oración`,
    }
  }
  return null
}

/**
 * Signal 4: Transcript too short to contain real consent.
 * The 7-point checklist requires at minimum ~150 words when spoken naturally.
 */
function detectTooShort(text: string): TamperSignal | null {
  const wordCount = text.split(/\s+/).length
  if (wordCount < 50) {
    return {
      signal: 'transcript_too_short',
      description: 'Transcripción demasiado corta para contener todos los puntos requeridos',
      severity: 'high',
      value: `${wordCount} palabras (mínimo esperado: ~150)`,
    }
  }
  return null
}

/**
 * Signal 5: Missing first-person voice.
 * Consent video should have first-person statements: "yo", "mi nombre", "estoy"
 */
function detectMissingFirstPerson(text: string): TamperSignal | null {
  const firstPerson = /\b(yo|mi nombre|estoy|acepto|quiero|tengo|declaro|autorizo|soy)\b/gi
  const matches = text.match(firstPerson) ?? []
  const wordCount = text.split(/\s+/).length
  if (wordCount >= 60 && matches.length < 2) {
    return {
      signal: 'missing_first_person_voice',
      description: 'Pocas expresiones en primera persona — el video puede no ser una declaración directa',
      severity: 'medium',
      value: `${matches.length} expresiones en primera persona en ${wordCount} palabras`,
    }
  }
  return null
}

/**
 * Signal 6: Date inconsistency.
 * If the transcript mentions a specific year that differs from submission year, flag it.
 */
function detectDateInconsistency(text: string, submissionYear?: number): TamperSignal | null {
  if (!submissionYear) return null
  const yearMatches = text.match(/\b(20\d{2})\b/g) ?? []
  const mentionedYears = [...new Set(yearMatches.map(Number))]
  const inconsistent = mentionedYears.filter((y) => y !== submissionYear && y > 2020 && y <= 2030)
  if (inconsistent.length > 0) {
    return {
      signal: 'date_inconsistency',
      description: `El año mencionado en el video (${inconsistent.join(', ')}) no coincide con el año de solicitud (${submissionYear})`,
      severity: 'high',
      value: `Años detectados: ${mentionedYears.join(', ')}`,
    }
  }
  return null
}

// ----------------------------------------------------------
// Vision-based check (optional GPT-4o Vision)
// ----------------------------------------------------------

/**
 * Optional: Ask GPT-4o Vision "is this a real person speaking?"
 * Only runs if VIDEO_OPENAI_VISION_KEY is set.
 * Returns a risk signal or null.
 */
async function detectVisionAnomalies(frameB64: string): Promise<TamperSignal | null> {
  const apiKey = process.env.VIDEO_OPENAI_VISION_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey || !frameB64) return null

  try {
    const prompt = `You are reviewing a frame from a consent video submitted for an insurance application.
Assess if this appears to be:
A) A real person speaking directly to a camera in a natural environment
B) A deepfake, AI-generated avatar, or heavily edited/synthetic video
C) Cannot determine

Respond with ONLY a JSON object: {"assessment": "real" | "synthetic" | "inconclusive", "reason": "<1 sentence>", "confidence": 0.0-1.0}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frameB64}` } },
            { type: 'text', text: prompt },
          ],
        }],
        max_tokens: 150,
      }),
    })

    if (!response.ok) return null

    const json = await response.json()
    const content: string = json.choices?.[0]?.message?.content ?? ''
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
      assessment?: string
      reason?: string
      confidence?: number
    }

    if (parsed.assessment === 'synthetic' && (parsed.confidence ?? 0) >= 0.6) {
      return {
        signal: 'vision_synthetic_detection',
        description: `GPT-4o Vision detectó posible video sintético/deepfake: ${parsed.reason ?? 'sin razón'}`,
        severity: 'high',
        value: `confidence: ${parsed.confidence?.toFixed(2)}`,
      }
    }

    if (parsed.assessment === 'inconclusive') {
      return {
        signal: 'vision_inconclusive',
        description: `GPT-4o Vision no pudo determinar autenticidad: ${parsed.reason ?? 'sin razón'}`,
        severity: 'low',
        value: `confidence: ${parsed.confidence?.toFixed(2)}`,
      }
    }

    return null // 'real' assessment — no signal
  } catch {
    return null // Vision errors are non-blocking
  }
}

// ----------------------------------------------------------
// Main: assessTamperRisk
// ----------------------------------------------------------

export type TamperRisk = 'low' | 'inconclusive' | 'suspicious' | 'not_evaluated'

export interface TamperAssessment {
  risk: TamperRisk
  signals: TamperSignal[]
  evaluated: boolean
}

/**
 * Assess tamper / AI-edit risk for a consent video.
 *
 * @param transcript       - Full transcription text (required for text signals)
 * @param frameB64         - Optional base64 video frame for vision check
 * @param submissionYear   - Year of the solicitud (for date consistency check)
 */
export async function assessTamperRisk(
  transcript: string | undefined,
  frameB64?: string,
  submissionYear?: number
): Promise<TamperAssessment> {
  if (!transcript || transcript.trim().length < 10) {
    return {
      risk: 'not_evaluated',
      signals: [],
      evaluated: false,
    }
  }

  const signals: TamperSignal[] = []

  // Run all text-based signal detectors
  const textSignals = [
    detectTooShort(transcript),
    detectLackOfHesitation(transcript),
    detectMissingFirstPerson(transcript),
    detectExactPhraseRepetition(transcript),
    detectUnnaturalStructure(transcript),
    detectDateInconsistency(transcript, submissionYear),
  ]

  for (const s of textSignals) {
    if (s) signals.push(s)
  }

  // Optional: vision-based check
  if (frameB64) {
    const visionSignal = await detectVisionAnomalies(frameB64)
    if (visionSignal) signals.push(visionSignal)
  }

  // Compute overall risk
  const highCount = signals.filter((s) => s.severity === 'high').length
  const mediumCount = signals.filter((s) => s.severity === 'medium').length
  const totalWeight = highCount * 2 + mediumCount * 1

  let risk: TamperRisk
  if (totalWeight === 0) {
    risk = 'low'
  } else if (totalWeight === 1) {
    risk = 'inconclusive'
  } else {
    risk = 'suspicious'
  }

  return { risk, signals, evaluated: true }
}

// ----------------------------------------------------------
// Convert TamperAssessment → QualityFinding
// ----------------------------------------------------------

export function tamperAssessmentToFinding(
  assessment: TamperAssessment,
  solicitudId?: string | null,
  policyNumber?: string | null,
  agentId?: string | null,
  dependencia?: string | null,
  qualityRunId?: string
): QualityFinding | null {
  if (!assessment.evaluated || assessment.risk === 'low') return null

  const base: Partial<QualityFinding> = {
    quality_run_id: qualityRunId,
    solicitud_id: solicitudId ?? null,
    policy_number: policyNumber ?? null,
    agent_id: agentId ?? null,
    dependencia: dependencia ?? null,
    category: 'doc_authenticity',
    detected_at: new Date().toISOString(),
    evidence: {
      tamper_risk: assessment.risk,
      signal_count: assessment.signals.length,
      signals: assessment.signals,
    },
  }

  if (assessment.risk === 'suspicious') {
    return {
      ...base,
      severity: 'flag',
      rule_code: RULE_CODES.VIDEO_TAMPER_SUSPICIOUS,
      status_label: 'pending_manual_review',
      title: `Video: ${assessment.signals.length} señal(es) de posible edición/generación AI detectada(s)`,
      detail: assessment.signals
        .map((s) => `[${s.severity.toUpperCase()}] ${s.description}`)
        .join(' | '),
    } as QualityFinding
  }

  // inconclusive
  return {
    ...base,
    severity: 'info' as QualityFinding['severity'],
    rule_code: RULE_CODES.VIDEO_TAMPER_INCONCLUSIVE,
    status_label: 'approved_for_emision',
    title: 'Video: señal menor de edición posible (no concluyente)',
    detail: assessment.signals[0]?.description ?? 'Señal de baja confianza detectada.',
  } as QualityFinding
}
