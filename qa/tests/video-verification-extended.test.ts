/**
 * QA: video-verification-extended.test.ts
 * Tests for extended video verification features:
 *   - Agent name detection in transcript
 *   - Tamper / AI-edit risk assessment (text signals)
 *   - agentNameFindingFromIngest()
 *   - tamperAssessmentToFinding()
 *
 * Added: 2026-03-19 (Milestone 2 — extended video verification)
 */

import { detectAgentNameInTranscript, agentNameFindingFromIngest } from '@/lib/filtro-calidad/video-ingest'
import { assessTamperRisk, tamperAssessmentToFinding } from '@/lib/filtro-calidad/video-tamper'
import { RULE_CODES } from '@/lib/filtro-calidad/types'

// ── Agent name detection ──────────────────────────────────────────────────────

describe('detectAgentNameInTranscript', () => {
  it('returns true when full name is present', () => {
    const transcript = 'Mi asesora fue María González quien me explicó el seguro.'
    expect(detectAgentNameInTranscript(transcript, 'María González')).toBe(true)
  })

  it('returns true when first name only appears (partial match)', () => {
    const transcript = 'Me atendió Rodrigo durante la visita.'
    expect(detectAgentNameInTranscript(transcript, 'Rodrigo Sánchez López')).toBe(true)
  })

  it('returns true when name is accent-variant (STT may drop accents)', () => {
    const transcript = 'La agente fue Monica quien me explico todo'
    expect(detectAgentNameInTranscript(transcript, 'Mónica Ramírez')).toBe(true)
  })

  it('returns false when name is not mentioned', () => {
    const transcript = 'Yo acepto el seguro y mis beneficiarios son mis hijos.'
    expect(detectAgentNameInTranscript(transcript, 'Carlos Hernández Medina')).toBe(false)
  })

  it('returns false for empty transcript', () => {
    expect(detectAgentNameInTranscript('', 'Juan Pérez')).toBe(false)
  })

  it('returns false for empty agent name', () => {
    expect(detectAgentNameInTranscript('hola soy juan', '')).toBe(false)
  })

  it('ignores 2-char parts (too short for reliable match)', () => {
    // 'de' and 'la' are 2 chars, should not match
    const transcript = 'no tiene ninguna de las características mencionadas'
    expect(detectAgentNameInTranscript(transcript, 'De La Cruz')).toBe(false)
  })
})

// ── agentNameFindingFromIngest ────────────────────────────────────────────────

describe('agentNameFindingFromIngest', () => {
  it('returns null when transcript is not available', () => {
    const result = { stage: 'parse' as const, status: 'failed' as const }
    const finding = agentNameFindingFromIngest(result, 'Juan Pérez', 'sol-1')
    expect(finding).toBeNull()
  })

  it('returns null when agentName is not provided', () => {
    const result = { stage: 'complete' as const, status: 'ok' as const, transcript: 'some text', agent_name_detected: true }
    const finding = agentNameFindingFromIngest(result, null, 'sol-1')
    expect(finding).toBeNull()
  })

  it('returns stop finding when name not detected', () => {
    const result = {
      stage: 'complete' as const,
      status: 'ok' as const,
      transcript: 'acepto el seguro de vida',
      agent_name_detected: false,
    }
    const finding = agentNameFindingFromIngest(result, 'Carlos Medina', 'sol-1')
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('stop')
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_AGENT_NAME_NOT_SAID)
  })

  it('returns info finding when name detected', () => {
    const result = {
      stage: 'complete' as const,
      status: 'ok' as const,
      transcript: 'mi agente Carlos me explicó todo',
      agent_name_detected: true,
    }
    const finding = agentNameFindingFromIngest(result, 'Carlos Medina', 'sol-1')
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('info')
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_AGENT_NAME_CONFIRMED)
  })
})

// ── Tamper risk assessment ────────────────────────────────────────────────────

describe('assessTamperRisk', () => {
  it('returns not_evaluated when transcript is empty', async () => {
    const result = await assessTamperRisk(undefined)
    expect(result.risk).toBe('not_evaluated')
    expect(result.evaluated).toBe(false)
  })

  it('returns not_evaluated when transcript is very short', async () => {
    const result = await assessTamperRisk('hola')
    expect(result.risk).toBe('not_evaluated')
    expect(result.evaluated).toBe(false)
  })

  it('returns low risk for natural conversational Spanish', async () => {
    const natural = `
      Bueno, este, mi nombre es Juan Carlos Rodríguez. Hoy es 15 de marzo del 2026.
      Mmm, estoy aquí para decir que, pues, yo acepto el seguro de vida con GNP.
      Mi agente fue Rodrigo Sánchez quien me explicó todo. Eh, quiero contratar la póliza.
      Mis beneficiarios son mi esposa con el 60 por ciento y mis hijos con el 40 por ciento, o sea, el total.
      Autorizo el descuento de 450 pesos de mi quincena. No deseo cancelar mis otras pólizas.
    `
    const result = await assessTamperRisk(natural)
    expect(result.evaluated).toBe(true)
    expect(result.risk).toBe('low')
    expect(result.signals).toHaveLength(0)
  })

  it('detects transcript too short signal', async () => {
    const short = 'Acepto el seguro. Mis beneficiarios son mi esposa.'
    const result = await assessTamperRisk(short)
    expect(result.evaluated).toBe(true)
    const signal = result.signals.find((s) => s.signal === 'transcript_too_short')
    expect(signal).toBeDefined()
    expect(signal!.severity).toBe('high')
  })

  it('detects missing first-person voice', async () => {
    // Third-person narration, no "yo/mi/acepto/etc."
    const thirdPerson = `
      El asegurado confirma que desea adquirir la póliza de vida colectiva GNP.
      La contratación incluye los beneficiarios indicados en el formulario adjunto.
      El agente verificó que todos los documentos fueron entregados correctamente.
      El monto del descuento ha sido acordado previamente entre las partes involucradas.
      No existe ninguna intención de cancelar pólizas anteriores a este contrato nuevo.
      La cobertura comienza a partir de la fecha de emisión del presente documento.
    `
    const result = await assessTamperRisk(thirdPerson)
    expect(result.evaluated).toBe(true)
    const signal = result.signals.find((s) => s.signal === 'missing_first_person_voice')
    expect(signal).toBeDefined()
  })

  it('detects date inconsistency when wrong year mentioned', async () => {
    const wrongYear = `
      Bueno eh mi nombre es Juan Pérez, hoy es el día 5 de marzo de 2024.
      Acepto el seguro y mis beneficiarios son mi familia con el cien por ciento.
      La cuota mensual es de trescientos pesos. No quiero cancelar mis pólizas.
    `
    const result = await assessTamperRisk(wrongYear, undefined, 2026)
    expect(result.evaluated).toBe(true)
    const signal = result.signals.find((s) => s.signal === 'date_inconsistency')
    expect(signal).toBeDefined()
    expect(signal!.severity).toBe('high')
  })

  it('returns suspicious when 2+ high/medium signals detected', async () => {
    // Short text + no first person → 2 signals
    const sus = 'El asegurado acepta. El monto acordado. Los beneficiarios nominados. Tres puntos principales.'
    const result = await assessTamperRisk(sus)
    expect(result.evaluated).toBe(true)
    // Should have at least transcript_too_short (high)
    expect(result.signals.length).toBeGreaterThan(0)
  })
})

// ── tamperAssessmentToFinding ─────────────────────────────────────────────────

describe('tamperAssessmentToFinding', () => {
  it('returns null when risk is low', () => {
    const finding = tamperAssessmentToFinding({ risk: 'low', signals: [], evaluated: true })
    expect(finding).toBeNull()
  })

  it('returns null when not evaluated', () => {
    const finding = tamperAssessmentToFinding({ risk: 'not_evaluated', signals: [], evaluated: false })
    expect(finding).toBeNull()
  })

  it('returns flag finding for suspicious risk', () => {
    const signals = [
      { signal: 'no_hesitation_markers', description: 'No hesitation', severity: 'medium' as const },
      { signal: 'missing_first_person_voice', description: 'No first person', severity: 'medium' as const },
    ]
    const finding = tamperAssessmentToFinding({ risk: 'suspicious', signals, evaluated: true }, 'sol-1')
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('flag')
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_TAMPER_SUSPICIOUS)
    expect(finding!.status_label).toBe('pending_manual_review')
  })

  it('returns info finding for inconclusive risk', () => {
    const signals = [
      { signal: 'transcript_too_short', description: 'Too short', severity: 'high' as const, value: '30 palabras' },
    ]
    const finding = tamperAssessmentToFinding({ risk: 'inconclusive', signals, evaluated: true }, 'sol-1')
    expect(finding).not.toBeNull()
    expect(finding!.rule_code).toBe(RULE_CODES.VIDEO_TAMPER_INCONCLUSIVE)
  })
})
