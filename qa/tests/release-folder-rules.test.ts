/**
 * QA: lib/release-folder-rules.ts
 * Tests folio suggestion logic and tipo-contratación mapping.
 */
import {
  matchFoliosByDependencia,
  matchTipoContratacion,
  FOLIO_RULES,
  TIPO_CONTRATACION_RULES,
} from '@/lib/release-folder-rules'

describe('matchFoliosByDependencia', () => {
  it('returns IMSS folios for "IMSS" input', () => {
    const results = matchFoliosByDependencia('IMSS')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.dependencia.toUpperCase().includes('IMSS'))).toBe(true)
  })

  it('returns ISSSTE folios for "ISSSTE" input', () => {
    const results = matchFoliosByDependencia('ISSSTE')
    expect(results.length).toBeGreaterThan(0)
    const allFolios = results.flatMap((r) => r.folios)
    // ISSSTE folio starts with N
    expect(allFolios.some((f) => f.startsWith('N'))).toBe(true)
  })

  it('returns SEP folios for "SEP" input', () => {
    const results = matchFoliosByDependencia('SEP')
    expect(results.length).toBeGreaterThan(0)
  })

  it('returns GOB CDMX folio for "CDMX" input', () => {
    const results = matchFoliosByDependencia('CDMX')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.folios.includes('N0073208'))).toBe(true)
  })

  it('returns empty for unknown dependencia', () => {
    const results = matchFoliosByDependencia('ZZZUNKNOWN123')
    expect(results).toHaveLength(0)
  })

  it('returns empty for null/empty input', () => {
    expect(matchFoliosByDependencia(null)).toHaveLength(0)
    expect(matchFoliosByDependencia('')).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    const upper = matchFoliosByDependencia('IMSS')
    const lower = matchFoliosByDependencia('imss')
    expect(upper.length).toBe(lower.length)
  })
})

describe('matchTipoContratacion', () => {
  it('returns correct rule for TC=01 (Confianza)', () => {
    const result = matchTipoContratacion('01')
    expect(result).toBeDefined()
    expect(result!.label).toBe('Confianza')
    expect(result!.dependencia).toBe('IMSS ACTIVOS')
    expect(result!.concepto).toBe('195')
    expect(result!.contrato).toBe('15')
  })

  it('returns Jub. Ant. for TC=10', () => {
    const result = matchTipoContratacion('10')
    expect(result).toBeDefined()
    expect(result!.dependencia).toBe('IMSS JUBILADOS')
    expect(result!.concepto).toBe('395')
    expect(result!.contrato).toBe('16')
  })

  it('returns undefined for unknown TC', () => {
    const result = matchTipoContratacion('99')
    expect(result).toBeUndefined()
  })

  it('is case-insensitive for MANDOS', () => {
    const result = matchTipoContratacion('mandos')
    expect(result).toBeDefined()
    expect(result!.label).toBe('Mandos Superiores')
  })

  it('all TC rules have contrato field set', () => {
    TIPO_CONTRATACION_RULES.forEach((rule) => {
      expect(rule.contrato).toBeTruthy()
    })
  })
})

describe('FOLIO_RULES integrity', () => {
  it('all folio rules have at least one folio', () => {
    FOLIO_RULES.forEach((rule) => {
      expect(rule.folios.length).toBeGreaterThan(0)
    })
  })

  it('all folios start with N or P (GNP format)', () => {
    FOLIO_RULES.forEach((rule) => {
      rule.folios.forEach((folio) => {
        expect(folio).toMatch(/^[NP]\d{7}$/)
      })
    })
  })

  it('no duplicate folio numbers across all rules', () => {
    const allFolios = FOLIO_RULES.flatMap((r) => r.folios)
    const unique = new Set(allFolios)
    expect(unique.size).toBe(allFolios.length)
  })
})
