// ============================================================
// OCR Prefill Tests — Field mapping from OCR to FormData
// ============================================================

import {
  buildTalonPrefillPatch,
  buildINEPrefillPatch,
  isFieldFromOCR,
} from '@/lib/ocr/prefill'
import type { TalonFields, INEFields } from '@/lib/ocr/types'
import type { FormData } from '@/lib/types'
import { INITIAL_FORM_DATA } from '@/lib/types'

// ============================================================
// Talón Prefill Mapping
// ============================================================
describe('buildTalonPrefillPatch', () => {
  const fullTalon: TalonFields = {
    institucion: 'IMSS',
    clave_presupuestal: '1101',
    centro_de_trabajo: 'HGR1',
    llave_de_descuento: 'M123456',
    concepto_de_descuento: '195',
    tipo_contratacion: '01',
    clave_delegacional: 'V',
    matricula: 'M123456',
    rfc: 'GALM800515ABC',
    folio_fiscal: 'F001-2026',
    liquido_a_cobrar: 8500,
  }

  test('maps institucion to contratante_dependencia', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.contratante_dependencia).toBe('IMSS')
  })

  test('maps rfc to contratante_rfc', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.contratante_rfc).toBe('GALM800515ABC')
  })

  test('maps matricula to matricula', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.matricula).toBe('M123456')
  })

  test('maps clave_delegacional to clave_delegacional', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.clave_delegacional).toBe('V')
  })

  test('maps clave_presupuestal to ocr_clave_presupuestal', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.ocr_clave_presupuestal).toBe('1101')
  })

  test('maps centro_de_trabajo to ocr_centro_trabajo', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.ocr_centro_trabajo).toBe('HGR1')
  })

  test('maps llave_de_descuento to ocr_llave_descuento', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.ocr_llave_descuento).toBe('M123456')
  })

  test('maps concepto_de_descuento to ocr_concepto_descuento', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.ocr_concepto_descuento).toBe('195')
  })

  test('maps tipo_contratacion to ocr_tipo_contratacion', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.ocr_tipo_contratacion).toBe('01')
  })

  test('maps liquido_a_cobrar to ocr_liquido_a_cobrar as string', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.ocr_liquido_a_cobrar).toBe('8500')
  })

  test('tracks all sourced fields in ocr_sourced_fields', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.ocr_sourced_fields).toEqual(
      expect.arrayContaining([
        'contratante_dependencia',
        'contratante_rfc',
        'matricula',
        'clave_delegacional',
        'ocr_clave_presupuestal',
        'ocr_centro_trabajo',
        'ocr_llave_descuento',
        'ocr_concepto_descuento',
        'ocr_tipo_contratacion',
        'ocr_liquido_a_cobrar',
      ])
    )
    expect(patch.ocr_sourced_fields).toHaveLength(10)
  })

  test('skips empty string values', () => {
    const partial: TalonFields = {
      ...fullTalon,
      clave_delegacional: '',
      llave_de_descuento: '',
      folio_fiscal: '',
    }
    const patch = buildTalonPrefillPatch(partial)
    expect(patch.clave_delegacional).toBeUndefined()
    expect(patch.ocr_llave_descuento).toBeUndefined()
    // ocr_sourced_fields should not contain skipped keys
    expect(patch.ocr_sourced_fields).not.toContain('clave_delegacional')
    expect(patch.ocr_sourced_fields).not.toContain('ocr_llave_descuento')
  })

  test('skips null liquido_a_cobrar', () => {
    const partial: TalonFields = { ...fullTalon, liquido_a_cobrar: null }
    const patch = buildTalonPrefillPatch(partial)
    expect(patch.ocr_liquido_a_cobrar).toBeUndefined()
    expect(patch.ocr_sourced_fields).not.toContain('ocr_liquido_a_cobrar')
  })

  test('skips zero liquido_a_cobrar', () => {
    const partial: TalonFields = { ...fullTalon, liquido_a_cobrar: 0 }
    const patch = buildTalonPrefillPatch(partial)
    expect(patch.ocr_liquido_a_cobrar).toBeUndefined()
  })

  test('skips negative liquido_a_cobrar', () => {
    const partial: TalonFields = { ...fullTalon, liquido_a_cobrar: -500 }
    const patch = buildTalonPrefillPatch(partial)
    expect(patch.ocr_liquido_a_cobrar).toBeUndefined()
  })

  test('handles all-empty partial extraction gracefully', () => {
    const empty: TalonFields = {
      institucion: '',
      clave_presupuestal: '',
      centro_de_trabajo: '',
      llave_de_descuento: '',
      concepto_de_descuento: '',
      tipo_contratacion: '',
      clave_delegacional: '',
      matricula: '',
      rfc: '',
      folio_fiscal: '',
      liquido_a_cobrar: null,
    }
    const patch = buildTalonPrefillPatch(empty)
    expect(patch.ocr_sourced_fields).toEqual([])
  })

  test('does not include folio_fiscal in sourced fields (not a form field)', () => {
    const patch = buildTalonPrefillPatch(fullTalon)
    expect(patch.ocr_sourced_fields).not.toContain('folio_fiscal')
  })
})

// ============================================================
// INE Prefill Mapping
// ============================================================
describe('buildINEPrefillPatch', () => {
  const fullINE: INEFields = {
    nombre_completo: 'PEREZ LOPEZ JUAN CARLOS',
    curp: 'PELJ850101HDFRRN09',
    direccion: 'CALLE 5 123 COL CENTRO CDMX',
    clave_elector: 'PELJCR850101119',
  }

  test('maps nombre_completo to contratante_nombres', () => {
    const patch = buildINEPrefillPatch(fullINE)
    expect(patch.contratante_nombres).toBe('PEREZ LOPEZ JUAN CARLOS')
  })

  test('maps curp to contratante_curp', () => {
    const patch = buildINEPrefillPatch(fullINE)
    expect(patch.contratante_curp).toBe('PELJ850101HDFRRN09')
  })

  test('maps direccion to contratante_calle', () => {
    const patch = buildINEPrefillPatch(fullINE)
    expect(patch.contratante_calle).toBe('CALLE 5 123 COL CENTRO CDMX')
  })

  test('maps clave_elector to ocr_clave_elector', () => {
    const patch = buildINEPrefillPatch(fullINE)
    expect(patch.ocr_clave_elector).toBe('PELJCR850101119')
  })

  test('tracks all sourced fields in ocr_sourced_fields', () => {
    const patch = buildINEPrefillPatch(fullINE)
    expect(patch.ocr_sourced_fields).toEqual(
      expect.arrayContaining([
        'contratante_nombres',
        'contratante_curp',
        'contratante_calle',
        'ocr_clave_elector',
      ])
    )
    expect(patch.ocr_sourced_fields).toHaveLength(4)
  })

  test('skips empty fields', () => {
    const partial: INEFields = {
      nombre_completo: 'JUAN PEREZ',
      curp: '',
      direccion: '',
      clave_elector: 'PELJCR850101119',
    }
    const patch = buildINEPrefillPatch(partial)
    expect(patch.contratante_nombres).toBe('JUAN PEREZ')
    expect(patch.ocr_clave_elector).toBe('PELJCR850101119')
    expect(patch.contratante_curp).toBeUndefined()
    expect(patch.contratante_calle).toBeUndefined()
    expect(patch.ocr_sourced_fields).toHaveLength(2)
  })

  test('handles all-empty extraction gracefully', () => {
    const empty: INEFields = {
      nombre_completo: '',
      curp: '',
      direccion: '',
      clave_elector: '',
    }
    const patch = buildINEPrefillPatch(empty)
    expect(patch.ocr_sourced_fields).toEqual([])
  })
})

// ============================================================
// isFieldFromOCR
// ============================================================
describe('isFieldFromOCR', () => {
  test('returns true for OCR-sourced field', () => {
    const fd = {
      ...INITIAL_FORM_DATA,
      ocr_sourced_fields: ['contratante_rfc', 'matricula'],
    } as FormData
    expect(isFieldFromOCR(fd, 'contratante_rfc')).toBe(true)
  })

  test('returns false for non-OCR-sourced field', () => {
    const fd = {
      ...INITIAL_FORM_DATA,
      ocr_sourced_fields: ['contratante_rfc', 'matricula'],
    } as FormData
    expect(isFieldFromOCR(fd, 'contratante_nombres')).toBe(false)
  })

  test('returns false when ocr_sourced_fields is empty', () => {
    const fd = {
      ...INITIAL_FORM_DATA,
      ocr_sourced_fields: [],
    } as FormData
    expect(isFieldFromOCR(fd, 'contratante_rfc')).toBe(false)
  })

  test('returns false when ocr_sourced_fields is undefined', () => {
    const fd = { ...INITIAL_FORM_DATA } as FormData
    delete (fd as unknown as Record<string, unknown>).ocr_sourced_fields
    expect(isFieldFromOCR(fd, 'contratante_rfc')).toBe(false)
  })
})

// ============================================================
// Integration: Simulate prefill flow
// ============================================================
describe('OCR prefill integration', () => {
  test('full talon extraction builds a valid prefill patch', () => {
    const talon: TalonFields = {
      institucion: 'ISSSTE',
      clave_presupuestal: '1102',
      centro_de_trabajo: 'HGZ1',
      llave_de_descuento: 'A789',
      concepto_de_descuento: '395',
      tipo_contratacion: '10',
      clave_delegacional: 'XII',
      matricula: 'EMP456',
      rfc: 'LOGR900315ABC',
      folio_fiscal: 'UUID-2026-04',
      liquido_a_cobrar: 12345.67,
    }

    const patch = buildTalonPrefillPatch(talon)

    // Verify direct mappings
    expect(patch.contratante_dependencia).toBe('ISSSTE')
    expect(patch.contratante_rfc).toBe('LOGR900315ABC')
    expect(patch.matricula).toBe('EMP456')
    expect(patch.clave_delegacional).toBe('XII')

    // Verify OCR-specific fields
    expect(patch.ocr_clave_presupuestal).toBe('1102')
    expect(patch.ocr_centro_trabajo).toBe('HGZ1')
    expect(patch.ocr_llave_descuento).toBe('A789')
    expect(patch.ocr_concepto_descuento).toBe('395')
    expect(patch.ocr_tipo_contratacion).toBe('10')
    expect(patch.ocr_liquido_a_cobrar).toBe('12345.67')

    // Verify sourced fields count
    expect(patch.ocr_sourced_fields).toHaveLength(10)

    // Simulate merging into FormData
    const merged = { ...INITIAL_FORM_DATA, ...patch } as FormData
    expect(isFieldFromOCR(merged, 'contratante_dependencia')).toBe(true)
    expect(isFieldFromOCR(merged, 'contratante_nombres')).toBe(false)
  })

  test('full INE extraction builds a valid prefill patch', () => {
    const ine: INEFields = {
      nombre_completo: 'GARCIA RUIZ MARIA ELENA',
      curp: 'GARM850520MDFRRL09',
      direccion: 'AV REFORMA 505 COL JUAREZ CDMX 06600',
      clave_elector: 'GARCMR850520119',
    }

    const patch = buildINEPrefillPatch(ine)

    expect(patch.contratante_nombres).toBe('GARCIA RUIZ MARIA ELENA')
    expect(patch.contratante_curp).toBe('GARM850520MDFRRL09')
    expect(patch.contratante_calle).toBe('AV REFORMA 505 COL JUAREZ CDMX 06600')
    expect(patch.ocr_clave_elector).toBe('GARCMR850520119')
    expect(patch.ocr_sourced_fields).toHaveLength(4)

    // Simulate merging
    const merged = { ...INITIAL_FORM_DATA, ...patch } as FormData
    expect(isFieldFromOCR(merged, 'contratante_nombres')).toBe(true)
    expect(isFieldFromOCR(merged, 'contratante_rfc')).toBe(false)
  })

  test('sourced fields accumulate across multiple OCR runs', () => {
    const talon: TalonFields = {
      institucion: 'IMSS',
      clave_presupuestal: '1101',
      centro_de_trabajo: 'HGR1',
      llave_de_descuento: 'M123',
      concepto_de_descuento: '195',
      tipo_contratacion: '01',
      clave_delegacional: 'V',
      matricula: 'MAT123',
      rfc: 'GALM800515ABC',
      folio_fiscal: 'F1',
      liquido_a_cobrar: 5000,
    }

    const ine: INEFields = {
      nombre_completo: 'PEREZ LOPEZ JUAN',
      curp: 'PELJ850101HDFRRN09',
      direccion: 'CALLE 5 123',
      clave_elector: 'PELJCR850101119',
    }

    const talonPatch = buildTalonPrefillPatch(talon)
    const inePatch = buildINEPrefillPatch(ine)

    // Simulate accumulating sourced fields
    const existingSourced = (talonPatch.ocr_sourced_fields || []) as string[]
    const newSourced = (inePatch.ocr_sourced_fields || []) as string[]
    const merged = [...new Set([...existingSourced, ...newSourced])]

    expect(merged).toHaveLength(14) // 10 talon + 4 INE
    expect(merged).toContain('contratante_dependencia') // from talon
    expect(merged).toContain('contratante_nombres') // from INE
    expect(merged).toContain('contratante_curp') // from INE
  })
})
