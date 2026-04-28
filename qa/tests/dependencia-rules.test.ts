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

// ── Intake V2 deterministic rule engine ───────────────────────────────────────

import { resolveDependenciaRule } from '@/lib/dependencia-rules'

describe('resolveDependenciaRule — IMSS baseline', () => {
  it.each(['01', '02', '07', '09'])('maps IMSS active TC %s to concepto 195 and default folio', (tc) => {
    const result = resolveDependenciaRule({
      institucion: 'Instituto Mexicano del Seguro Social',
      tipo_contratacion: tc,
      matricula: '12345678',
    })

    expect(result.key).toBe('IMSS_ACTIVOS')
    expect(result.concepto).toBe('195')
    expect(result.contrato).toBe('15 - IMSS Activos')
    expect(result.folio).toBe('N0058293')
    expect(result.llave_descuento).toEqual({ source: 'matricula', value: '12345678', required: true })
  })

  it.each(['10', '11'])('maps IMSS jubilado TC %s to concepto 395 and Oriente folio', (tc) => {
    const result = resolveDependenciaRule({
      institucion: 'IMSS Jubilados',
      tipo_contratacion: tc,
      matricula: '87654321',
    })

    expect(result.key).toBe('IMSS_JUBILADOS')
    expect(result.concepto).toBe('395')
    expect(result.contrato).toBe('16 - VIDA MAS IMSS Jubilados')
    expect(result.folio).toBe('N0063319')
    expect(result.frecuencia).toBe('Mensual')
  })

  it('maps IMSS Estatuto A TC 0 to concepto 995', () => {
    const result = resolveDependenciaRule({
      institucion: 'IMSS',
      tipo_contratacion: '0',
      matricula: '11122233',
    })

    expect(result.key).toBe('IMSS_ESTATUTO_A')
    expect(result.concepto).toBe('995')
    expect(result.contrato).toBe('17 - Vida Mas Estatuto A')
    expect(result.folio).toBe('N0058293')
  })
})

describe('resolveDependenciaRule — SEP baseline', () => {
  it('maps clave presupuestal 11 + central centro trabajo to SEP Central folio', () => {
    const result = resolveDependenciaRule({
      institucion: 'Secretaría de Educación Pública',
      clave_presupuestal: '1100712345',
      centro_trabajo: 'SEP CENTRAL',
      rfc: 'PUMM800101ABC',
    })

    expect(result.key).toBe('SEP_CENTRAL')
    expect(result.subdependencia).toBe('00083 - SEP CENTRAL')
    expect(result.folio).toBe('N0064865')
    expect(result.concepto).toBe('G1')
    expect(result.llave_descuento.source).toBe('rfc_13')
  })

  it('maps media superior centro trabajo to SEP Media Superior folio', () => {
    const result = resolveDependenciaRule({
      institucion: 'SEP',
      clave_presupuestal: '11222',
      centro_trabajo: 'DGETI MEDIA SUPERIOR',
      rfc: 'PUMM800101ABC',
    })

    expect(result.key).toBe('SEP_MEDIA_SUPERIOR')
    expect(result.subdependencia).toBe('SEP MEDIA SUPERIOR')
    expect(result.folio).toBe('N0064867')
  })

  it('maps AFDSEDF centro trabajo to AFDSEDF folio', () => {
    const result = resolveDependenciaRule({
      institucion: 'SEP',
      clave_presupuestal: '11999',
      centro_trabajo: 'Administración Federal de Servicios Educativos',
      rfc: 'PUMM800101ABC',
    })

    expect(result.key).toBe('SEP_AFDSEDF')
    expect(result.subdependencia).toContain('ADMINISTRACION FEDERAL')
    expect(result.folio).toBe('N0064866')
  })
})

describe('resolveDependenciaRule — ISSSTE / GOB CDMX / UAQ', () => {
  it('maps ISSSTE with 6-digit employee number to N0051765', () => {
    const result = resolveDependenciaRule({
      institucion: 'ISSSTE',
      numero_empleado: '123456',
      concepto_descuento: '83',
    })

    expect(result.key).toBe('ISSSTE')
    expect(result.folio).toBe('N0051765')
    expect(result.contrato).toBe('2 - ISSSTE0093793001')
    expect(result.llave_descuento).toEqual({ source: 'numero_empleado', value: '123456', required: true })
    expect(result.warnings).toContain('ISSSTE only accepts INE as identification for DxN')
  })

  it('flags ISSSTE employee number requirement when missing', () => {
    const result = resolveDependenciaRule({ institucion: 'ISSSTE' })
    expect(result.manual_review_flags).toContain('issste_employee_number_6_digits_required')
  })

  it('maps GOB CDMX GNP-SEG to folio N0073208 and manual review requirements', () => {
    const result = resolveDependenciaRule({
      institucion: 'Gobierno de la Ciudad de México',
      concepto_descuento: 'GNP-SEG',
      numero_empleado: '778899',
      folio_fiscal: 'ABC-123',
    })

    expect(result.key).toBe('GOB_CDMX')
    expect(result.folio).toBe('N0073208')
    expect(result.concepto).toBe('GNP-SEG')
    expect(result.manual_review_flags).toEqual(expect.arrayContaining(['requires_formato_de_reserva', 'manual_review_required']))
    expect(result.required_documents).toEqual(expect.arrayContaining(['Formato de Reserva', '2 talones recientes']))
  })

  it('maps UAQ to RFC 10 llave and special consentimiento flag', () => {
    const result = resolveDependenciaRule({
      institucion: 'Universidad Autónoma de Querétaro',
      concepto_descuento: '341',
      rfc: 'PUMM800101ABC',
      fecha_ingreso: '2020-01-01',
    })

    expect(result.key).toBe('UAQ')
    expect(result.folio).toBe('N0091588')
    expect(result.llave_descuento).toEqual({ source: 'rfc_10', value: 'PUMM800101', required: true })
    expect(result.manual_review_flags).toContain('requires_special_consentimiento')
  })
})

describe('resolveDependenciaRule — Banco Quincenal fallback', () => {
  it('maps CLABE/banco-like payment to Banco Quincenal folio N0078461', () => {
    const result = resolveDependenciaRule({
      forma_cobro: 'clabe',
      institucion: 'IMSS',
    })

    expect(result.key).toBe('BANCO_QUINCENAL')
    expect(result.folio).toBe('N0078461')
    expect(result.contrato).toBe('20200001 - BANCO CALENDARIZADO QUINCENAL')
    expect(result.tipo_cobro).toBe('BANCO_CALENDARIZADO_QUINCENAL')
  })
})
