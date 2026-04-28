// ============================================================
// OCR Validation — RFC, CURP, and numeric field checks
// ============================================================

import type { ValidationResult, TalonFields, INEFields } from './types'

// RFC persona física: 4 letters + 6 digits + 3 alphanumeric
const RFC_FISICA_RE = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/
// RFC persona moral: 3 letters + 6 digits + 3 alphanumeric
const RFC_MORAL_RE = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/

// CURP: 4 letters + 6 digits + H/M + 5 letters + 2 alphanumeric
const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/

// Clave de elector: 6 letters (state+name initials) + 6-10 digits (approximate, varies by state)
const CLAVE_ELECTOR_RE = /^[A-Z]{6}\d{6,10}$/

// Valid concepto de descuento values
const VALID_CONCEPTOS = ['195', '395', '995', 'GNP-SEG', '83', '341', 'G1']

export function validateRFC(rfc: string): ValidationResult {
  if (!rfc || rfc.trim().length === 0) {
    return { valid: false, errors: ['RFC is empty'] }
  }
  const cleaned = rfc.trim().toUpperCase()
  if (RFC_FISICA_RE.test(cleaned) || RFC_MORAL_RE.test(cleaned)) {
    return { valid: true, errors: [] }
  }
  return {
    valid: false,
    errors: [`RFC "${cleaned}" does not match expected format (e.g. ABCD850101XYZ)`],
  }
}

export function validateCURP(curp: string): ValidationResult {
  if (!curp || curp.trim().length === 0) {
    return { valid: false, errors: ['CURP is empty'] }
  }
  const cleaned = curp.trim().toUpperCase()
  if (CURP_RE.test(cleaned)) {
    return { valid: true, errors: [] }
  }
  return {
    valid: false,
    errors: [`CURP "${cleaned}" does not match expected format (e.g. ABCD850101HDFRRL09)`],
  }
}

export function validateClaveElector(clave: string): ValidationResult {
  if (!clave || clave.trim().length === 0) {
    return { valid: false, errors: ['Clave de elector is empty'] }
  }
  const cleaned = clave.trim().toUpperCase()
  if (CLAVE_ELECTOR_RE.test(cleaned)) {
    return { valid: true, errors: [] }
  }
  return {
    valid: false,
    errors: [`Clave de elector "${cleaned}" does not match expected format`],
  }
}

export function validateConceptoDescuento(concepto: string): ValidationResult {
  if (!concepto || concepto.trim().length === 0) {
    return { valid: false, errors: ['Concepto de descuento is empty'] }
  }
  const cleaned = concepto.trim().toUpperCase()
  if (VALID_CONCEPTOS.includes(cleaned)) {
    return { valid: true, errors: [] }
  }
  return {
    valid: false,
    errors: [
      `Concepto de descuento "${cleaned}" is not valid. Expected one of: ${VALID_CONCEPTOS.join(', ')}`,
    ],
  }
}

export function validateLiquido(liquido: number | null): ValidationResult {
  if (liquido === null || liquido === undefined) {
    return { valid: false, errors: ['Líquido a cobrar is missing'] }
  }
  if (typeof liquido !== 'number' || isNaN(liquido)) {
    return { valid: false, errors: ['Líquido a cobrar is not a valid number'] }
  }
  if (liquido <= 0) {
    return { valid: false, errors: ['Líquido a cobrar must be positive'] }
  }
  return { valid: true, errors: [] }
}

export function validateClavePresupuestal(clave: string): ValidationResult {
  if (!clave || clave.trim().length === 0) {
    return { valid: false, errors: ['Clave presupuestal is empty'] }
  }
  // First 2 digits should be numeric
  const first2 = clave.trim().substring(0, 2)
  if (!/^\d{2}$/.test(first2)) {
    return {
      valid: false,
      errors: [`Clave presupuestal first 2 digits "${first2}" are not numeric`],
    }
  }
  return { valid: true, errors: [] }
}

// --- Composite validation ---
export function validateTalonFields(fields: TalonFields): ValidationResult {
  const errors: string[] = []

  if (!fields.institucion) errors.push('Institución is missing')
  if (!fields.matricula) errors.push('Matrícula is missing')

  const rfcResult = validateRFC(fields.rfc)
  if (!rfcResult.valid) errors.push(...rfcResult.errors)

  const conceptoResult = validateConceptoDescuento(fields.concepto_de_descuento)
  if (!conceptoResult.valid) errors.push(...conceptoResult.errors)

  const claveResult = validateClavePresupuestal(fields.clave_presupuestal)
  if (!claveResult.valid) errors.push(...claveResult.errors)

  const liquidoResult = validateLiquido(fields.liquido_a_cobrar)
  if (!liquidoResult.valid) errors.push(...liquidoResult.errors)

  return { valid: errors.length === 0, errors }
}

export function validateINEFields(fields: INEFields): ValidationResult {
  const errors: string[] = []

  if (!fields.nombre_completo) errors.push('Nombre completo is missing')

  const curpResult = validateCURP(fields.curp)
  if (!curpResult.valid) errors.push(...curpResult.errors)

  if (!fields.direccion) errors.push('Dirección is missing')
  if (!fields.clave_elector) errors.push('Clave de elector is missing')

  return { valid: errors.length === 0, errors }
}
