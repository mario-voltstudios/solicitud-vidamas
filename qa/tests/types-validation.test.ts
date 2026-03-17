/**
 * QA: lib/types.ts — validation helpers + entity extractors
 * Critical path: beneficiarios, contratante, asegurado, misma_persona mirror
 */
import {
  validateBeneficiarios,
  validateContratante,
  validateAsegurado,
  validateSolicitudEntities,
  extractContratante,
  extractAsegurado,
  extractCobroInfo,
  extractPlanInfo,
  PARENTESCOS,
  ESTADOS_MX,
  DEPENDENCIAS,
} from '@/lib/types'
import { makeBaseFormNomina, makeBaseFormCLABE, makeBeneficiario } from './helpers'

// ── validateBeneficiarios ─────────────────────────────────────────────────────

describe('validateBeneficiarios', () => {
  it('passes for single beneficiario at 100%', () => {
    const result = validateBeneficiarios([makeBeneficiario({ porcentaje: 100 })])
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('passes for two beneficiarios summing to 100%', () => {
    const result = validateBeneficiarios([
      makeBeneficiario({ porcentaje: 60 }),
      makeBeneficiario({ porcentaje: 40 }),
    ])
    expect(result.valid).toBe(true)
  })

  it('fails when beneficiarios is empty', () => {
    const result = validateBeneficiarios([])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/al menos un beneficiario/i)
  })

  it('fails when sum < 100', () => {
    const result = validateBeneficiarios([makeBeneficiario({ porcentaje: 60 })])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('100%'))).toBe(true)
  })

  it('fails when sum > 100', () => {
    const result = validateBeneficiarios([
      makeBeneficiario({ porcentaje: 60 }),
      makeBeneficiario({ porcentaje: 50 }),
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('100%'))).toBe(true)
  })

  it('allows float drift (e.g. 33.33+33.33+33.34)', () => {
    const result = validateBeneficiarios([
      makeBeneficiario({ porcentaje: 33.33 }),
      makeBeneficiario({ porcentaje: 33.33 }),
      makeBeneficiario({ porcentaje: 33.34 }),
    ])
    expect(result.valid).toBe(true)
  })

  it('fails when porcentaje is 0', () => {
    const result = validateBeneficiarios([makeBeneficiario({ porcentaje: 0 })])
    expect(result.valid).toBe(false)
  })

  it('fails when beneficiario missing nombres', () => {
    const result = validateBeneficiarios([makeBeneficiario({ nombres: '', porcentaje: 100 })])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('nombre'))).toBe(true)
  })

  it('fails when beneficiario missing parentesco', () => {
    const result = validateBeneficiarios([makeBeneficiario({ parentesco: '', porcentaje: 100 })])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('parentesco'))).toBe(true)
  })

  it('fails when beneficiario missing fecha_nac', () => {
    const result = validateBeneficiarios([makeBeneficiario({ fecha_nac: '', porcentaje: 100 })])
    expect(result.valid).toBe(false)
  })

  it('allows multiple beneficiarios with non-round sums at 100', () => {
    const result = validateBeneficiarios([
      makeBeneficiario({ porcentaje: 50 }),
      makeBeneficiario({ porcentaje: 25 }),
      makeBeneficiario({ porcentaje: 25 }),
    ])
    expect(result.valid).toBe(true)
  })
})

// ── validateContratante ───────────────────────────────────────────────────────

describe('validateContratante', () => {
  it('passes for fully populated contratante', () => {
    const form = makeBaseFormNomina()
    const result = validateContratante(form)
    expect(result.valid).toBe(true)
  })

  it('fails when nombres is empty', () => {
    const form = makeBaseFormNomina({ contratante_nombres: '' })
    const result = validateContratante(form)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('nombres'))).toBe(true)
  })

  it('fails when email is empty', () => {
    const form = makeBaseFormNomina({ contratante_email: '' })
    const result = validateContratante(form)
    expect(result.valid).toBe(false)
  })

  it('fails when dependencia is empty', () => {
    const form = makeBaseFormNomina({ contratante_dependencia: '' })
    const result = validateContratante(form)
    expect(result.valid).toBe(false)
  })
})

// ── validateAsegurado ─────────────────────────────────────────────────────────

describe('validateAsegurado — misma_persona=true', () => {
  it('passes without asegurado fields when misma_persona=true', () => {
    const form = makeBaseFormNomina({ misma_persona: true, asegurado_nombres: '' })
    const result = validateAsegurado(form)
    expect(result.valid).toBe(true)
  })
})

describe('validateAsegurado — misma_persona=false', () => {
  it('fails when asegurado_nombres is empty', () => {
    const form = makeBaseFormNomina({ misma_persona: false, asegurado_nombres: '' })
    const result = validateAsegurado(form)
    expect(result.valid).toBe(false)
  })

  it('passes when all asegurado fields are provided', () => {
    const form = makeBaseFormNomina({
      misma_persona: false,
      asegurado_nombres: 'PEDRO',
      asegurado_ap_paterno: 'MARTINEZ',
      asegurado_ap_materno: 'RUIZ',
      asegurado_fecha_nac: '1975-01-01',
      asegurado_genero: 'M',
      asegurado_rfc: 'MARP750101XYZ',
    })
    const result = validateAsegurado(form)
    expect(result.valid).toBe(true)
  })
})

// ── extractAsegurado — mirror logic ──────────────────────────────────────────

describe('extractAsegurado — misma_persona mirror', () => {
  it('mirrors contratante fields when misma_persona=true', () => {
    const form = makeBaseFormNomina({ misma_persona: true })
    const aseg = extractAsegurado(form)
    expect(aseg.nombres).toBe(form.contratante_nombres)
    expect(aseg.ap_paterno).toBe(form.contratante_ap_paterno)
    expect(aseg.fecha_nac).toBe(form.contratante_fecha_nac)
    expect(aseg.rfc).toBe(form.contratante_rfc)
    expect(aseg.misma_persona).toBe(true)
  })

  it('uses asegurado fields when misma_persona=false', () => {
    const form = makeBaseFormNomina({
      misma_persona: false,
      asegurado_nombres: 'PEDRO',
      asegurado_ap_paterno: 'MARTINEZ',
      asegurado_ap_materno: 'RUIZ',
      asegurado_fecha_nac: '1975-01-01',
      asegurado_genero: 'M',
      asegurado_rfc: 'MARP750101XYZ',
    })
    const aseg = extractAsegurado(form)
    expect(aseg.nombres).toBe('PEDRO')
    expect(aseg.rfc).toBe('MARP750101XYZ')
    expect(aseg.misma_persona).toBe(false)
  })
})

// ── extractCobroInfo ─────────────────────────────────────────────────────────

describe('extractCobroInfo', () => {
  it('extracts nomina fields correctly', () => {
    const form = makeBaseFormNomina()
    const cobro = extractCobroInfo(form)
    expect(cobro.forma_cobro).toBe('nomina')
    expect(cobro.matricula).toBe('M123456')
  })

  it('extracts CLABE fields correctly', () => {
    const form = makeBaseFormCLABE()
    const cobro = extractCobroInfo(form)
    expect(cobro.forma_cobro).toBe('clabe')
    expect(cobro.clabe).toBe('012345678901234567')
    expect(cobro.banco).toBe('BBVA Bancomer')
    expect(cobro.fecha_inicio_cobro).toBe('2026-04-01')
  })
})

// ── validateSolicitudEntities ─────────────────────────────────────────────────

describe('validateSolicitudEntities — end-to-end', () => {
  it('passes for a fully valid nomina solicitud', () => {
    const form = makeBaseFormNomina()
    const result = validateSolicitudEntities(form)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('aggregates errors from contratante + beneficiarios', () => {
    const form = makeBaseFormNomina({
      contratante_nombres: '',
      beneficiarios: [],
    })
    const result = validateSolicitudEntities(form)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(1)
  })
})

// ── Constants validation ──────────────────────────────────────────────────────

describe('Constants — dropdown values', () => {
  it('PARENTESCOS has at least 5 entries', () => {
    expect(PARENTESCOS.length).toBeGreaterThanOrEqual(5)
  })

  it('PARENTESCOS includes expected values', () => {
    expect(PARENTESCOS).toContain('Cónyuge')
    expect(PARENTESCOS).toContain('Hijo(a)')
    expect(PARENTESCOS).toContain('Padre')
    expect(PARENTESCOS).toContain('Madre')
  })

  it('ESTADOS_MX has all 32 states+CDMX (32 entries)', () => {
    expect(ESTADOS_MX).toHaveLength(32)
  })

  it('ESTADOS_MX includes Ciudad de México', () => {
    expect(ESTADOS_MX).toContain('Ciudad de México')
  })

  it('DEPENDENCIAS includes IMSS, ISSSTE, SEP', () => {
    expect(DEPENDENCIAS).toContain('IMSS')
    expect(DEPENDENCIAS).toContain('ISSSTE')
    expect(DEPENDENCIAS).toContain('SEP')
  })
})
