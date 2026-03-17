/**
 * QA: dependencia-rules.ts
 * Tests the document requirement logic for each dependencia + forma_cobro combination.
 * This is the critical path for intake cutover.
 */
import {
  normalizeDependencia,
  getDependenciaRequirements,
  getMissingRequiredDocs,
  getUploadedDocs,
  DocType,
} from '@/lib/dependencia-rules'
import { makeBaseFormNomina, makeBaseFormCLABE } from './helpers'

// ── normalizeDependencia ───────────────────────────────────────────────────────

describe('normalizeDependencia', () => {
  it('returns IMSS_ACTIVOS for "IMSS"', () => {
    expect(normalizeDependencia('IMSS')).toBe('IMSS_ACTIVOS')
  })

  it('returns IMSS_JUBILADOS for "IMSS JUBILADOS"', () => {
    expect(normalizeDependencia('IMSS JUBILADOS')).toBe('IMSS_JUBILADOS')
  })

  it('returns IMSS_JUBILADOS for "IMSS JUB."', () => {
    expect(normalizeDependencia('IMSS JUB.')).toBe('IMSS_JUBILADOS')
  })

  it('returns ISSSTE for "ISSSTE"', () => {
    expect(normalizeDependencia('ISSSTE')).toBe('ISSSTE')
  })

  it('returns SEP for "SEP"', () => {
    expect(normalizeDependencia('SEP')).toBe('SEP')
  })

  it('returns GOB_CDMX for "GOBIERNO CDMX"', () => {
    expect(normalizeDependencia('GOBIERNO CDMX')).toBe('GOB_CDMX')
  })

  it('returns GOB_CDMX for "CIUDAD DE MEXICO"', () => {
    expect(normalizeDependencia('CIUDAD DE MEXICO')).toBe('GOB_CDMX')
  })

  it('returns GOBIERNO for generic "GOBIERNO ESTATAL"', () => {
    expect(normalizeDependencia('GOBIERNO ESTATAL')).toBe('GOBIERNO')
  })

  it('returns OTRA for unknown', () => {
    expect(normalizeDependencia('PEMEX')).toBe('OTRA')
  })

  it('returns SIN_DEPENDENCIA for empty string', () => {
    expect(normalizeDependencia('')).toBe('SIN_DEPENDENCIA')
  })

  it('returns SIN_DEPENDENCIA for null', () => {
    expect(normalizeDependencia(null)).toBe('SIN_DEPENDENCIA')
  })

  it('is case-insensitive', () => {
    expect(normalizeDependencia('imss')).toBe('IMSS_ACTIVOS')
    expect(normalizeDependencia('issste')).toBe('ISSSTE')
  })
})

// ── getDependenciaRequirements ─────────────────────────────────────────────────

describe('getDependenciaRequirements — IMSS Activos + nómina', () => {
  const form = makeBaseFormNomina({ contratante_dependencia: 'IMSS' })
  const reqs = getDependenciaRequirements(form)
  const keys = reqs.map((r) => r.key)

  it('includes ine_frente', () => expect(keys).toContain('ine_frente'))
  it('includes ine_reverso', () => expect(keys).toContain('ine_reverso'))
  it('includes talon (nomina)', () => expect(keys).toContain('talon'))
  it('includes solicitud_p1', () => expect(keys).toContain('solicitud_p1'))
  it('includes solicitud_p2', () => expect(keys).toContain('solicitud_p2'))
  it('includes solicitud_p3', () => expect(keys).toContain('solicitud_p3'))
  it('does NOT include carta_instruccion', () => expect(keys).not.toContain('carta_instruccion'))
  it('does NOT include constancia_derechohabiente', () =>
    expect(keys).not.toContain('constancia_derechohabiente'))
  it('does NOT include clave_unica_pago', () => expect(keys).not.toContain('clave_unica_pago'))
  it('all signature docs are required', () => {
    const sigDocs = reqs.filter((r) => r.category === 'signature')
    expect(sigDocs.every((d) => d.required)).toBe(true)
  })
})

describe('getDependenciaRequirements — IMSS Jubilados + nómina', () => {
  const form = makeBaseFormNomina({ contratante_dependencia: 'IMSS JUBILADOS' })
  const reqs = getDependenciaRequirements(form)
  const keys = reqs.map((r) => r.key)

  it('includes carta_instruccion (required)', () => {
    const doc = reqs.find((r) => r.key === 'carta_instruccion')
    expect(doc).toBeDefined()
    expect(doc!.required).toBe(true)
  })
  it('includes talon', () => expect(keys).toContain('talon'))
  it('includes signature docs p1-p3', () => {
    expect(keys).toContain('solicitud_p1')
    expect(keys).toContain('solicitud_p2')
    expect(keys).toContain('solicitud_p3')
  })
})

describe('getDependenciaRequirements — ISSSTE + nómina', () => {
  const form = makeBaseFormNomina({ contratante_dependencia: 'ISSSTE' })
  const reqs = getDependenciaRequirements(form)
  const keys = reqs.map((r) => r.key)

  it('includes constancia_derechohabiente (optional)', () => {
    const doc = reqs.find((r) => r.key === 'constancia_derechohabiente')
    expect(doc).toBeDefined()
    expect(doc!.required).toBe(false)
  })
  it('does NOT include carta_instruccion', () => expect(keys).not.toContain('carta_instruccion'))
})

describe('getDependenciaRequirements — SEP + nómina', () => {
  const form = makeBaseFormNomina({ contratante_dependencia: 'SEP' })
  const reqs = getDependenciaRequirements(form)
  const keys = reqs.map((r) => r.key)

  it('includes clave_unica_pago (optional)', () => {
    const doc = reqs.find((r) => r.key === 'clave_unica_pago')
    expect(doc).toBeDefined()
    expect(doc!.required).toBe(false)
  })
  it('does NOT include carta_instruccion', () => expect(keys).not.toContain('carta_instruccion'))
  it('does NOT include constancia_derechohabiente', () =>
    expect(keys).not.toContain('constancia_derechohabiente'))
})

describe('getDependenciaRequirements — Gobierno CDMX + nómina', () => {
  const form = makeBaseFormNomina({ contratante_dependencia: 'Gobierno CDMX' })
  const reqs = getDependenciaRequirements(form)
  const keys = reqs.map((r) => r.key)

  it('includes signature docs', () => {
    expect(keys).toContain('solicitud_p1')
    expect(keys).toContain('solicitud_p2')
    expect(keys).toContain('solicitud_p3')
  })
  it('does NOT include carta_instruccion', () => expect(keys).not.toContain('carta_instruccion'))
})

describe('getDependenciaRequirements — CLABE payment (no nómina)', () => {
  const form = makeBaseFormCLABE({ contratante_dependencia: '' })
  const reqs = getDependenciaRequirements(form)
  const keys = reqs.map((r) => r.key)

  it('does NOT include talon when forma_cobro=clabe', () =>
    expect(keys).not.toContain('talon'))
  it('includes ine_frente and ine_reverso', () => {
    expect(keys).toContain('ine_frente')
    expect(keys).toContain('ine_reverso')
  })
})

// ── getMissingRequiredDocs ────────────────────────────────────────────────────

describe('getMissingRequiredDocs', () => {
  it('returns empty when all required docs are present for IMSS+nómina', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'IMSS',
      docs_ine_frente: 'path/ine-f.jpg',
      docs_ine_reverso: 'path/ine-r.jpg',
      docs_talon: 'path/talon.pdf',
      docs_solicitud_p1: 'path/p1.pdf',
      docs_solicitud_p2: 'path/p2.pdf',
      docs_solicitud_p3: 'path/p3.pdf',
    })
    const missing = getMissingRequiredDocs(form)
    expect(missing).toHaveLength(0)
  })

  it('returns talon as missing when forma_cobro=nomina and talon not uploaded', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'IMSS',
      docs_talon: undefined,
      docs_ine_frente: 'x',
      docs_ine_reverso: 'x',
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
    })
    const missing = getMissingRequiredDocs(form)
    expect(missing.map((d) => d.key)).toContain('talon')
  })

  it('returns carta_instruccion as missing for IMSS Jubilados without it', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'IMSS JUBILADOS',
      docs_carta_instruccion: undefined,
      docs_ine_frente: 'x',
      docs_ine_reverso: 'x',
      docs_talon: 'x',
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
    })
    const missing = getMissingRequiredDocs(form)
    expect(missing.map((d) => d.key)).toContain('carta_instruccion')
  })

  it('does NOT flag clave_unica_pago as missing for SEP (it is optional)', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'SEP',
      docs_clave_unica_pago: undefined,
      docs_ine_frente: 'x',
      docs_ine_reverso: 'x',
      docs_talon: 'x',
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
    })
    const missing = getMissingRequiredDocs(form)
    expect(missing.map((d) => d.key)).not.toContain('clave_unica_pago')
  })

  it('does NOT flag constancia_derechohabiente as missing for ISSSTE (it is optional)', () => {
    const form = makeBaseFormNomina({
      contratante_dependencia: 'ISSSTE',
      docs_constancia_derechohabiente: undefined,
      docs_ine_frente: 'x',
      docs_ine_reverso: 'x',
      docs_talon: 'x',
      docs_solicitud_p1: 'x',
      docs_solicitud_p2: 'x',
      docs_solicitud_p3: 'x',
    })
    const missing = getMissingRequiredDocs(form)
    expect(missing.map((d) => d.key)).not.toContain('constancia_derechohabiente')
  })
})
