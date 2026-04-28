// ============================================================
// OCR Tests — Validation + extraction logic (unit tests)
// ============================================================
// NOTE: These tests cover validation and parsing logic.
// API integration tests require OPENAI_API_KEY and are skipped by default.

import { POST } from '@/app/api/ocr/extract/route'
import {
  validateRFC,
  validateCURP,
  validateClaveElector,
  validateConceptoDescuento,
  validateLiquido,
  validateClavePresupuestal,
  validateTalonFields,
  validateINEFields,
} from '@/lib/ocr/validation'
import { extractINE, extractTalon } from '@/lib/ocr/extract'
import type { TalonFields, INEFields } from '@/lib/ocr/types'

jest.mock('@/lib/ocr/extract', () => ({
  extractTalon: jest.fn(),
  extractINE: jest.fn(),
}))

const mockExtractTalon = extractTalon as jest.MockedFunction<typeof extractTalon>
const mockExtractINE = extractINE as jest.MockedFunction<typeof extractINE>

// ============================================================
// RFC Validation
// ============================================================
describe('validateRFC', () => {
  test('accepts valid persona física RFC', () => {
    const result = validateRFC('GALM800515ABC')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('accepts valid persona moral RFC', () => {
    const result = validateRFC('XYZ850101ABC')
    expect(result.valid).toBe(true)
  })

  test('rejects empty RFC', () => {
    const result = validateRFC('')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('empty')
  })

  test('rejects malformed RFC (too short)', () => {
    const result = validateRFC('GALM80')
    expect(result.valid).toBe(false)
  })

  test('rejects malformed RFC (wrong structure)', () => {
    const result = validateRFC('123456789012345')
    expect(result.valid).toBe(false)
  })

  test('handles lowercase input by converting to uppercase', () => {
    const result = validateRFC('galm800515abc')
    expect(result.valid).toBe(true)
  })

  test('trims whitespace', () => {
    const result = validateRFC('  GALM800515ABC  ')
    expect(result.valid).toBe(true)
  })
})

// ============================================================
// CURP Validation
// ============================================================
describe('validateCURP', () => {
  test('accepts valid CURP', () => {
    const result = validateCURP('PELJ850101HDFRRN09')
    expect(result.valid).toBe(true)
  })

  test('accepts female CURP', () => {
    const result = validateCURP('GALM800515MDFRCR09')
    expect(result.valid).toBe(true)
  })

  test('rejects empty CURP', () => {
    const result = validateCURP('')
    expect(result.valid).toBe(false)
  })

  test('rejects malformed CURP', () => {
    const result = validateCURP('NOTACURP')
    expect(result.valid).toBe(false)
  })
})

// ============================================================
// Clave de Elector Validation
// ============================================================
describe('validateClaveElector', () => {
  test('accepts valid clave de elector', () => {
    const result = validateClaveElector('PELJCR850101119')
    expect(result.valid).toBe(true)
  })

  test('rejects empty clave', () => {
    const result = validateClaveElector('')
    expect(result.valid).toBe(false)
  })

  test('rejects malformed clave', () => {
    const result = validateClaveElector('ABC123')
    expect(result.valid).toBe(false)
  })
})

// ============================================================
// Concepto de Descuento Validation
// ============================================================
describe('validateConceptoDescuento', () => {
  test.each(['195', '395', '995', 'GNP-SEG', '83', '341', 'G1'])(
    'accepts valid concepto: %s',
    (concepto) => {
      const result = validateConceptoDescuento(concepto)
      expect(result.valid).toBe(true)
    }
  )

  test('rejects invalid concepto', () => {
    const result = validateConceptoDescuento('500')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('not valid')
  })

  test('rejects empty concepto', () => {
    const result = validateConceptoDescuento('')
    expect(result.valid).toBe(false)
  })

  test('handles case variation (gnp-seg)', () => {
    const result = validateConceptoDescuento('gnp-seg')
    expect(result.valid).toBe(true)
  })
})

// ============================================================
// Líquido a Cobrar Validation
// ============================================================
describe('validateLiquido', () => {
  test('accepts positive number', () => {
    expect(validateLiquido(8500.50).valid).toBe(true)
  })

  test('accepts integer', () => {
    expect(validateLiquido(10000).valid).toBe(true)
  })

  test('rejects null', () => {
    expect(validateLiquido(null).valid).toBe(false)
  })

  test('rejects zero', () => {
    expect(validateLiquido(0).valid).toBe(false)
  })

  test('rejects negative', () => {
    expect(validateLiquido(-500).valid).toBe(false)
  })

  test('rejects NaN', () => {
    expect(validateLiquido(NaN).valid).toBe(false)
  })
})

// ============================================================
// Clave Presupuestal Validation
// ============================================================
describe('validateClavePresupuestal', () => {
  test('accepts valid clave with 2-digit prefix', () => {
    expect(validateClavePresupuestal('1101').valid).toBe(true)
  })

  test('accepts longer clave with 2-digit prefix', () => {
    expect(validateClavePresupuestal('11010100').valid).toBe(true)
  })

  test('rejects empty clave', () => {
    expect(validateClavePresupuestal('').valid).toBe(false)
  })

  test('rejects clave not starting with 2 digits', () => {
    expect(validateClavePresupuestal('AB01').valid).toBe(false)
  })
})

// ============================================================
// Composite Talon Validation
// ============================================================
describe('validateTalonFields', () => {
  const validTalon: TalonFields = {
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

  test('accepts fully valid talón', () => {
    const result = validateTalonFields(validTalon)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('catches missing institución', () => {
    const result = validateTalonFields({ ...validTalon, institucion: '' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Institución is missing')
  })

  test('catches missing matrícula', () => {
    const result = validateTalonFields({ ...validTalon, matricula: '' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Matrícula is missing')
  })

  test('catches invalid RFC', () => {
    const result = validateTalonFields({ ...validTalon, rfc: 'BAD' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('RFC'))).toBe(true)
  })

  test('catches invalid concepto', () => {
    const result = validateTalonFields({ ...validTalon, concepto_de_descuento: '500' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Concepto'))).toBe(true)
  })

  test('accumulates multiple errors', () => {
    const bad = { ...validTalon, institucion: '', rfc: 'BAD', liquido_a_cobrar: null }
    const result = validateTalonFields(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })
})

// ============================================================
// Composite INE Validation
// ============================================================
describe('validateINEFields', () => {
  const validINE: INEFields = {
    nombre_completo: 'PEREZ LOPEZ JUAN CARLOS',
    curp: 'PELJ850101HDFRRN09',
    direccion: 'CALLE 5 123 COL CENTRO CDMX',
    clave_elector: 'PELJCR850101119',
  }

  test('accepts fully valid INE', () => {
    const result = validateINEFields(validINE)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('catches missing nombre', () => {
    const result = validateINEFields({ ...validINE, nombre_completo: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Nombre'))).toBe(true)
  })

  test('catches invalid CURP', () => {
    const result = validateINEFields({ ...validINE, curp: 'NOTACURP' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('CURP'))).toBe(true)
  })

  test('catches missing dirección', () => {
    const result = validateINEFields({ ...validINE, direccion: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Dirección'))).toBe(true)
  })

  test('catches missing clave de elector', () => {
    const result = validateINEFields({ ...validINE, clave_elector: '' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.toLowerCase().includes('clave de elector'))).toBe(true)
  })
})

// ============================================================
// OCR API route contract
// ============================================================
describe('POST /api/ocr/extract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function jsonRequest(body: unknown): Request {
    return new Request('http://localhost/api/ocr/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  test('returns structured talón extraction payload', async () => {
    const talon: TalonFields = {
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

    mockExtractTalon.mockResolvedValueOnce({
      result: {
        provider: 'test-provider',
        type: 'talon',
        confidence: 1,
        extracted: talon,
      },
      validation: { valid: true, errors: [] },
    })

    const response = await POST(jsonRequest({ type: 'talon', imageBase64: 'abc123' }) as never)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      success: true,
      data: {
        type: 'talon',
        extracted: talon,
        confidence: 1,
        validation: { valid: true, errors: [] },
        warnings: [],
        provider: 'test-provider',
      },
    })
    expect(mockExtractTalon).toHaveBeenCalledWith('abc123', { validate: true })
  })

  test('returns structured INE extraction payload', async () => {
    const ine: INEFields = {
      nombre_completo: 'PEREZ LOPEZ JUAN CARLOS',
      curp: 'PELJ850101HDFRRN09',
      direccion: 'CALLE 5 123 COL CENTRO CDMX',
      clave_elector: 'PELJCR850101119',
    }

    mockExtractINE.mockResolvedValueOnce({
      result: {
        provider: 'test-provider',
        type: 'ine',
        confidence: 1,
        extracted: ine,
        warnings: ['review manually'],
      },
      validation: { valid: true, errors: [] },
    })

    const response = await POST(jsonRequest({ type: 'ine', imageUrl: 'https://example.com/ine.jpg' }) as never)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).toEqual({
      type: 'ine',
      extracted: ine,
      confidence: 1,
      validation: { valid: true, errors: [] },
      warnings: ['review manually'],
      provider: 'test-provider',
    })
    expect(mockExtractINE).toHaveBeenCalledWith('https://example.com/ine.jpg', { validate: true })
  })

  test('returns safe provider failure shape', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockExtractTalon.mockRejectedValueOnce(new Error('OPENAI_API_KEY leaked provider detail'))

    const response = await POST(jsonRequest({ type: 'talon', imageBase64: 'abc123' }) as never)
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload).toEqual({
      success: false,
      error: 'OCR extraction failed',
      code: 'OCR_PROVIDER_ERROR',
    })
    expect(JSON.stringify(payload)).not.toContain('OPENAI_API_KEY')
    consoleError.mockRestore()
  })

  test('rejects missing document input before provider call', async () => {
    const response = await POST(jsonRequest({ type: 'ine' }) as never)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ success: false, error: 'Provide imageUrl or imageBase64' })
    expect(mockExtractINE).not.toHaveBeenCalled()
    expect(mockExtractTalon).not.toHaveBeenCalled()
  })
})

// ============================================================
// OCR Persistence Contract
// ============================================================
describe('OCR persistence contract', () => {
  const persistenceTalon: TalonFields = {
    institucion: 'IMSS',
    clave_presupuestal: '11ABC',
    centro_de_trabajo: 'CENTRO 1',
    llave_de_descuento: 'MAT123',
    concepto_de_descuento: '195',
    tipo_contratacion: '01',
    clave_delegacional: '01',
    matricula: '123456',
    rfc: 'GALM800515ABC',
    folio_fiscal: 'FOLIO123',
    liquido_a_cobrar: 1500,
  }

  test('builds success patch for structured talón OCR payload', async () => {
    const { buildOCRSuccessPersistencePatch } = await import('@/lib/ocr/persistence')
    const result = {
      provider: 'openai',
      type: 'talon' as const,
      confidence: 91,
      extracted: persistenceTalon,
      warnings: ['low contrast'],
      raw_text: 'raw talon text',
    }

    const patch = buildOCRSuccessPersistencePatch(result, '2026-04-28T14:00:00.000Z')

    expect(patch).toMatchObject({
      ocr_state: 'done',
      ocr_at: '2026-04-28T14:00:00.000Z',
      ocr_payload: result,
      ocr_data: persistenceTalon,
      ocr_raw: 'raw talon text',
      ocr_error: null,
      ocr_errors: ['low contrast'],
      ocr_confidence: 91,
      ocr_provider: 'openai',
      ocr_document_type: 'talon',
      ocr_processed_at: '2026-04-28T14:00:00.000Z',
    })
  })

  test('builds failure patch without exposing provider exception shape', async () => {
    const { buildOCRFailurePersistencePatch } = await import('@/lib/ocr/persistence')

    const patch = buildOCRFailurePersistencePatch(
      'OCR_PROVIDER_ERROR',
      'ine',
      '2026-04-28T14:01:00.000Z',
    )

    expect(patch).toMatchObject({
      ocr_state: 'failed',
      ocr_payload: null,
      ocr_data: null,
      ocr_error: 'OCR_PROVIDER_ERROR',
      ocr_errors: ['OCR_PROVIDER_ERROR'],
      ocr_confidence: null,
      ocr_document_type: 'ine',
      ocr_processed_at: '2026-04-28T14:01:00.000Z',
    })
  })
})
