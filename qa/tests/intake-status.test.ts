/**
 * QA: lib/intake-status.ts — deriveIntakeStatus
 * Validates correct status derivation for all key intake scenarios.
 */
import { deriveIntakeStatus } from '@/lib/intake-status'
import { makeBaseFormNomina, makeBaseFormCLABE } from './helpers'

describe('deriveIntakeStatus — IMSS Activos + nómina', () => {
  it('returns ready_for_emision when all required docs uploaded', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'IMSS',
      docs_ine_frente: 'path/ine-f.jpg',
      docs_ine_reverso: 'path/ine-r.jpg',
      docs_talon: 'path/talon.pdf',
      docs_solicitud_p1: 'path/p1.pdf',
      docs_solicitud_p2: 'path/p2.pdf',
      docs_solicitud_p3: 'path/p3.pdf',
      docs_video: 'path/video.mp4',
    })
    const result = deriveIntakeStatus(form)
    expect(result.status).toBe('ready_for_emision')
    expect(result.missingDocs).toHaveLength(0)
  })

  it('returns pending_verification when docs OK but video missing', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'IMSS',
      docs_ine_frente: 'path/ine-f.jpg',
      docs_ine_reverso: 'path/ine-r.jpg',
      docs_talon: 'path/talon.pdf',
      docs_solicitud_p1: 'path/p1.pdf',
      docs_solicitud_p2: 'path/p2.pdf',
      docs_solicitud_p3: 'path/p3.pdf',
      docs_video: undefined,
    })
    const result = deriveIntakeStatus(form)
    expect(result.status).toBe('pending_verification')
    expect(result.missingVerification).toContain('Video de verificación')
  })

  it('returns pending_docs when talon is missing', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'IMSS',
      docs_talon: undefined,
      docs_ine_frente: 'x',
      docs_ine_reverso: 'x',
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
    })
    const result = deriveIntakeStatus(form)
    expect(result.status).toBe('pending_docs')
    expect(result.missingDocs.some((d) => d.includes('Talón'))).toBe(true)
  })

  it('returns pending_docs when INE docs are missing', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'IMSS',
      docs_ine_frente: undefined,
      docs_ine_reverso: undefined,
      docs_talon: 'x',
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
    })
    const result = deriveIntakeStatus(form)
    expect(result.status).toBe('pending_docs')
  })
})

describe('deriveIntakeStatus — IMSS Jubilados', () => {
  it('returns pending_docs when carta_instruccion is missing', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'IMSS JUBILADOS',
      docs_ine_frente: 'x',
      docs_ine_reverso: 'x',
      docs_talon: 'x',
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
      docs_carta_instruccion: undefined,
    })
    const result = deriveIntakeStatus(form)
    expect(result.status).toBe('pending_docs')
    expect(result.missingDocs.some((d) => d.toLowerCase().includes('carta'))).toBe(true)
  })

  it('returns ready_for_emision when carta_instruccion is present + video', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'IMSS JUBILADOS',
      docs_ine_frente: 'x',
      docs_ine_reverso: 'x',
      docs_talon: 'x',
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
      docs_carta_instruccion: 'x',
      docs_video: 'x',
    })
    const result = deriveIntakeStatus(form)
    expect(result.status).toBe('ready_for_emision')
  })
})

describe('deriveIntakeStatus — CLABE payment', () => {
  it('returns pending_docs when INE missing (no talon needed for CLABE)', () => {
    const form = makeBaseFormCLABE({
      docs_ine_frente: undefined,
      docs_ine_reverso: undefined,
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
    })
    const result = deriveIntakeStatus(form)
    expect(result.status).toBe('pending_docs')
    expect(result.missingDocs.some((d) => d.includes('INE'))).toBe(true)
  })

  it('does NOT list talon as missing for CLABE payment', () => {
    const form = makeBaseFormCLABE({
      docs_ine_frente: 'x',
      docs_ine_reverso: 'x',
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
      docs_talon: undefined,
      docs_video: 'x',
    })
    const result = deriveIntakeStatus(form)
    expect(result.missingDocs.some((d) => d.toLowerCase().includes('talón'))).toBe(false)
  })
})
