// ============================================================
// CFDI Validation Tests
// qa/tests/cfdi-validation.test.ts
// Created: 2026-03-19
// ============================================================

import {
  parseSATQRUrl,
  extractQRFromText,
  extractUUIDFromText,
  isValidCFDIUUID,
} from '../../lib/cfdi/qr-extractor'
import { cfdiValidationToFinding } from '../../lib/cfdi/cfdi-to-finding'
import type { CFDIValidationResult } from '../../lib/cfdi/types'

// ──────────────────────────────────────────────────────────────
// parseSATQRUrl
// ──────────────────────────────────────────────────────────────
describe('parseSATQRUrl', () => {
  const validURL =
    'https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx' +
    '?id=a1b2c3d4-e5f6-7890-abcd-ef1234567890' +
    '&re=IMSS670805E81' +
    '&rr=PUMP850101AA1' +
    '&tt=0.00' +
    '&fe=ABCD1234'

  it('parses a valid SAT QR URL', () => {
    const result = parseSATQRUrl(validURL)
    expect(result).not.toBeNull()
    expect(result!.uuid).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')
    expect(result!.rfc_emisor).toBe('IMSS670805E81')
    expect(result!.rfc_receptor).toBe('PUMP850101AA1')
    expect(result!.total).toBe('0.00')
    expect(result!.sello_tail).toBe('ABCD1234')
  })

  it('returns null for non-SAT URL', () => {
    expect(parseSATQRUrl('https://example.com/foo?bar=baz')).toBeNull()
  })

  it('returns null for malformed UUID', () => {
    const badURL =
      'https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=not-a-uuid&re=X&rr=Y'
    expect(parseSATQRUrl(badURL)).toBeNull()
  })

  it('returns null for missing required params', () => {
    const noRE =
      'https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=a1b2c3d4-e5f6-7890-abcd-ef1234567890&rr=Y'
    expect(parseSATQRUrl(noRE)).toBeNull()
  })

  it('normalizes UUID to uppercase', () => {
    const lower = validURL.replace('A1B2C3D4', 'a1b2c3d4')
    const result = parseSATQRUrl(lower)
    expect(result?.uuid).toMatch(/^[A-F0-9-]+$/)
  })
})

// ──────────────────────────────────────────────────────────────
// extractQRFromText
// ──────────────────────────────────────────────────────────────
describe('extractQRFromText', () => {
  it('finds a SAT QR URL embedded in OCR text', () => {
    const ocrText = `
      IMSS
      Talón de Pago - Quincena 1 2026
      Nombre: Juan López Ramírez
      RFC: LORJ800101AA1

      Comprobante Fiscal:
      https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=11223344-5566-7788-99aa-bbccddeeff00&re=IMSS670805E81&rr=LORJ800101AA1&tt=0.00&fe=XXXXXXXX

      Gracias por su preferencia
    `
    const result = extractQRFromText(ocrText)
    expect(result).not.toBeNull()
    expect(result!.uuid).toBe('11223344-5566-7788-99AA-BBCCDDEEFF00')
  })

  it('returns null when no URL present', () => {
    expect(extractQRFromText('plain text with no URL')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractQRFromText('')).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────
// extractUUIDFromText
// ──────────────────────────────────────────────────────────────
describe('extractUUIDFromText', () => {
  it('extracts a bare UUID from text', () => {
    const text = 'Folio Fiscal: 11223344-5566-7788-99aa-bbccddeeff00 - periodo enero'
    expect(extractUUIDFromText(text)).toBe('11223344-5566-7788-99AA-BBCCDDEEFF00')
  })

  it('returns null when no UUID in text', () => {
    expect(extractUUIDFromText('no uuid here')).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────
// isValidCFDIUUID
// ──────────────────────────────────────────────────────────────
describe('isValidCFDIUUID', () => {
  it('accepts valid UUID', () => {
    expect(isValidCFDIUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true)
  })

  it('rejects non-UUID', () => {
    expect(isValidCFDIUUID('not-a-uuid')).toBe(false)
    expect(isValidCFDIUUID('')).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────
// cfdiValidationToFinding
// ──────────────────────────────────────────────────────────────
describe('cfdiValidationToFinding', () => {
  it('returns null for valid status', () => {
    const result: CFDIValidationResult = {
      status: 'valid',
      summary: 'CFDI verificado',
    }
    expect(cfdiValidationToFinding(result)).toBeNull()
  })

  it('returns null for skipped status', () => {
    const result: CFDIValidationResult = { status: 'skipped', summary: '' }
    expect(cfdiValidationToFinding(result)).toBeNull()
  })

  it('returns hard stop finding for duplicate', () => {
    const result: CFDIValidationResult = {
      status: 'duplicate',
      summary: 'UUID ya existe en otra solicitud',
    }
    const finding = cfdiValidationToFinding(result, 'sol-1', 'AGT123', 'IMSS')
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('stop')
    expect(finding!.rule_code).toBe('DUPLICATE_CFDI_UUID')
    expect(finding!.status_label).toBe('blocked_duplicate_risk')
    expect(finding!.solicitud_id).toBe('sol-1')
    expect(finding!.agent_id).toBe('AGT123')
  })

  it('returns hard stop finding for cancelled CFDI', () => {
    const result: CFDIValidationResult = {
      status: 'cancelled',
      summary: 'CFDI cancelado en SAT',
    }
    const finding = cfdiValidationToFinding(result)
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('stop')
    expect(finding!.rule_code).toBe('CFDI_CANCELLED')
    expect(finding!.status_label).toBe('blocked_doc_authenticity_risk')
  })

  it('returns flag finding for SAT unreachable', () => {
    const result: CFDIValidationResult = {
      status: 'sat_unreachable',
      summary: 'No se pudo conectar al SAT',
    }
    const finding = cfdiValidationToFinding(result)
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('flag')
    expect(finding!.rule_code).toBe('CFDI_SAT_UNREACHABLE')
  })

  it('returns flag finding for extraction_failed', () => {
    const result: CFDIValidationResult = {
      status: 'extraction_failed',
      summary: 'No se encontró QR en el talón',
    }
    const finding = cfdiValidationToFinding(result)
    expect(finding).not.toBeNull()
    expect(finding!.severity).toBe('flag')
    expect(finding!.rule_code).toBe('CFDI_EXTRACTION_FAILED')
  })

  it('returns flag finding for not_found', () => {
    const result: CFDIValidationResult = {
      status: 'not_found',
      summary: 'CFDI no encontrado en SAT',
    }
    const finding = cfdiValidationToFinding(result)
    expect(finding!.severity).toBe('flag')
    expect(finding!.rule_code).toBe('CFDI_NOT_FOUND')
  })
})
