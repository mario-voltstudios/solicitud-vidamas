// ============================================================
// Tarifario Validation Tests — Quote logic + dependencia rules
// ============================================================

// Set env vars before any imports that need them
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key'
process.env.SUPABASE_SECRET_KEY = 'test-secret-key'

import { calcularEdad, validateQuoteForDependencia, normalizePlanName, QuoteResult } from '@/lib/tarifarios'
import type { FormData } from '@/lib/types'
import { makeBaseFormNomina } from './helpers'

// ============================================================
// calcularEdad

describe('calcularEdad', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-28'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('returns correct age for a 45-year-old born 1980-05-15', () => {
    expect(calcularEdad('1980-05-15')).toBe(45)
  })

  test('returns correct age for a 30-year-old born 1996-01-10', () => {
    expect(calcularEdad('1996-01-10')).toBe(30)
  })

  test('returns 0 for empty string', () => {
    expect(calcularEdad('')).toBe(0)
  })

  test('returns 0 for invalid date', () => {
    expect(calcularEdad('not-a-date')).toBe(0)
  })

  test('handles birthday not yet reached this year', () => {
    // Born Dec 31, 1990 — not yet 36 in April 2026
    expect(calcularEdad('1990-12-31')).toBe(35)
  })

  test('handles birthday already passed this year', () => {
    // Born Jan 1, 1990 — already 36 in April 2026
    expect(calcularEdad('1990-01-01')).toBe(36)
  })

  test('handles today as birthday', () => {
    expect(calcularEdad('2000-04-28')).toBe(26)
  })

  test('minimum insurable age 15', () => {
    expect(calcularEdad('2011-04-28')).toBe(15)
  })

  test('age 65 boundary', () => {
    expect(calcularEdad('1961-04-28')).toBe(65)
  })
})

// ============================================================
// normalizePlanName

describe('normalizePlanName', () => {
  test('normalizes lowercase plan names', () => {
    expect(normalizePlanName('integral')).toBe('Integral')
    expect(normalizePlanName('salud')).toBe('Salud')
    expect(normalizePlanName('accidentes')).toBe('Accidentes')
    expect(normalizePlanName('esencial')).toBe('Esencial')
  })

  test('returns same string for already-normalized names', () => {
    expect(normalizePlanName('Integral')).toBe('Integral')
    expect(normalizePlanName('Salud')).toBe('Salud')
  })

  test('returns original for unknown plans', () => {
    expect(normalizePlanName('Vida Premium')).toBe('Vida Premium')
  })
})

// ============================================================
// validateQuoteForDependencia

describe('validateQuoteForDependencia', () => {
  function makeQuote(overrides: Partial<QuoteResult> = {}): QuoteResult {
    return {
      suma_asegurada: 250000,
      edad_calculo: 28,
      descuentos_aplicados: ['No fumador (-2 años)'],
      prima_quincenal: 250,
      plan: 'Integral',
      risk_type: 'estandar',
      data_quality: 'exact',
      ...overrides,
    }
  }

  test('returns no warnings for a valid quote matching form data', () => {
    const quote = makeQuote({ prima_quincenal: 500 })
    const form = makeBaseFormNomina({ plan: 'Integral', prima_base: '500' })
    const warnings = validateQuoteForDependencia(quote, form)
    expect(warnings).toEqual([])
  })

  test('warns when prima does not match', () => {
    const quote = makeQuote({ prima_quincenal: 250 })
    const form = makeBaseFormNomina({ plan: 'Integral', prima_base: '500' })
    const warnings = validateQuoteForDependencia(quote, form)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('no coincide')
  })

  test('warns when data_quality is not exact', () => {
    const quote = makeQuote({ data_quality: 'interpolated', prima_quincenal: 500 })
    const form = makeBaseFormNomina({ plan: 'Integral', prima_base: '500' })
    const warnings = validateQuoteForDependencia(quote, form)
    expect(warnings.some((w) => w.includes('interpolada'))).toBe(true)
  })

  test('warns when data_quality is unknown', () => {
    const quote = makeQuote({ data_quality: 'approximate', prima_quincenal: 500 })
    const form = makeBaseFormNomina({ plan: 'Integral', prima_base: '500' })
    const warnings = validateQuoteForDependencia(quote, form)
    expect(warnings.some((w) => w.includes('Calidad de datos'))).toBe(true)
  })

  test('warns when suma_asegurada is 0', () => {
    const quote = makeQuote({ suma_asegurada: 0, prima_quincenal: 500 })
    const form = makeBaseFormNomina({ plan: 'Integral', prima_base: '500' })
    const warnings = validateQuoteForDependencia(quote, form)
    expect(warnings.some((w) => w.includes('suma asegurada'))).toBe(true)
  })

  test('warns when plan is not a recognized GNP plan', () => {
    const quote = makeQuote({ plan: 'Vida Premium', prima_quincenal: 500 })
    const form = makeBaseFormNomina({ plan: 'Vida Premium', prima_base: '500' })
    const warnings = validateQuoteForDependencia(quote, form)
    expect(warnings.some((w) => w.includes('no es uno de los 4 planes'))).toBe(true)
  })

  test('accepts all 4 valid GNP plans', () => {
    const plans = ['Integral', 'Salud', 'Accidentes', 'Esencial']
    for (const plan of plans) {
      const quote = makeQuote({ plan, prima_quincenal: 200 })
      const form = makeBaseFormNomina({ plan, prima_base: '200' })
      const planWarnings = validateQuoteForDependencia(quote, form)
      const planSpecificWarnings = planWarnings.filter((w) => w.includes('planes GNP'))
      expect(planSpecificWarnings).toEqual([])
    }
  })

  test('combines multiple warnings', () => {
    const quote = makeQuote({
      prima_quincenal: 999, // mismatch
      data_quality: 'interpolated',
      suma_asegurada: 0,
    })
    const form = makeBaseFormNomina({ plan: 'Integral', prima_base: '500' })
    const warnings = validateQuoteForDependencia(quote, form)
    expect(warnings.length).toBeGreaterThanOrEqual(3)
  })
})

// ============================================================
// Quote parameter validation (API route input rules)
// These mirror the validation in app/api/quote/route.ts
// without importing the route (avoids Supabase init at import time).

describe('Quote parameter validation', () => {
  function validateQuoteParams(body: Record<string, unknown>): { valid: boolean; error: string } {
    if (!body.plan) return { valid: false, error: 'Plan es requerido' }
    if (!body.prima_quincenal || (body.prima_quincenal as number) <= 0) return { valid: false, error: 'Prima quincenal debe ser mayor a 0' }
    if (!body.edad_real || (body.edad_real as number) < 15 || (body.edad_real as number) > 65) return { valid: false, error: 'Edad debe estar entre 15 y 65 años' }
    if (!body.genero || !['M', 'F'].includes(body.genero as string)) return { valid: false, error: 'Género debe ser M o F' }
    return { valid: true, error: '' }
  }

  test('rejects missing plan', () => {
    const result = validateQuoteParams({ prima_quincenal: 250, edad_real: 30, genero: 'M', no_fumar: true })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Plan')
  })

  test('rejects zero prima', () => {
    const result = validateQuoteParams({ plan: 'Integral', prima_quincenal: 0, edad_real: 30, genero: 'M', no_fumar: true })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Prima')
  })

  test('rejects negative prima', () => {
    const result = validateQuoteParams({ plan: 'Integral', prima_quincenal: -100, edad_real: 30, genero: 'M', no_fumar: true })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Prima')
  })

  test('rejects out-of-range age (< 15)', () => {
    const result = validateQuoteParams({ plan: 'Integral', prima_quincenal: 250, edad_real: 10, genero: 'M', no_fumar: true })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Edad')
  })

  test('rejects out-of-range age (> 65)', () => {
    const result = validateQuoteParams({ plan: 'Integral', prima_quincenal: 250, edad_real: 70, genero: 'M', no_fumar: true })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Edad')
  })

  test('rejects invalid genero', () => {
    const result = validateQuoteParams({ plan: 'Integral', prima_quincenal: 250, edad_real: 30, genero: 'X', no_fumar: true })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Género')
  })

  test('rejects empty genero', () => {
    const result = validateQuoteParams({ plan: 'Integral', prima_quincenal: 250, edad_real: 30, genero: '', no_fumar: true })
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Género')
  })

  test('accepts valid parameters', () => {
    const result = validateQuoteParams({ plan: 'Integral', prima_quincenal: 250, edad_real: 30, genero: 'M', no_fumar: true })
    expect(result.valid).toBe(true)
    expect(result.error).toBe('')
  })
})

// ============================================================
// fetchQuote input edge cases

describe('fetchQuote input validation', () => {
  // These test the client-side validation logic
  // (actual fetch is not called in unit tests)

  test('calcularEdad returns 0 for undefined-like inputs', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-28'))
    expect(calcularEdad(null as unknown as string)).toBe(0)
    expect(calcularEdad(undefined as unknown as string)).toBe(0)
    jest.useRealTimers()
  })

  test('calcularEdad handles YYYY/MM/DD format gracefully', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-28'))
    // This should still parse via Date constructor
    const result = calcularEdad('1990/05/15')
    expect(result).toBe(35)
    jest.useRealTimers()
  })
})
