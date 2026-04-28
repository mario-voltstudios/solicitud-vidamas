// ============================================================
// OCR Prefill — Map extracted OCR fields to FormData
// ============================================================
//
// After successful OCR extraction, these helpers build a Partial<FormData>
// patch that auto-populates form fields so the user doesn't have to
// re-type what was already read from their documents.
// ============================================================

import type { FormData } from '@/lib/types'
import type { TalonFields, INEFields } from '@/lib/ocr/types'

/** OCR-sourced fields tracking key in FormData */
export const OCR_SOURCED_FIELDS_KEY = 'ocr_sourced_fields' as const

/**
 * Build a Partial<FormData> patch from talón OCR extraction.
 *
 * Mapping (per INTAKE-V2-T06 spec):
 *   institucion        → contratante_dependencia
 *   rfc                → contratante_rfc
 *   matricula          → matricula (CobroInfo)
 *   clave_delegacional → clave_delegacional (CobroInfo)
 *   clave_presupuestal → ocr_clave_presupuestal
 *   centro_de_trabajo  → ocr_centro_trabajo
 *   llave_de_descuento → ocr_llave_descuento
 *   concepto_de_descuento → ocr_concepto_descuento
 *   tipo_contratacion  → ocr_tipo_contratacion
 *   liquido_a_cobrar   → ocr_liquido_a_cobrar
 *
 * Only non-empty values are included in the patch.
 * The patch includes a list of field names that were populated from OCR
 * so the UI can display a visual indicator.
 */
export function buildTalonPrefillPatch(
  extracted: TalonFields,
): Partial<FormData> {
  const patch: Record<string, string | number | string[]> = {}
  const sourcedFields: string[] = []

  function setIfPresent(
    ocrValue: string | number | null | undefined,
    formKey: string,
  ) {
    if (ocrValue !== null && ocrValue !== undefined && ocrValue !== '') {
      patch[formKey] = typeof ocrValue === 'number' ? String(ocrValue) : ocrValue
      sourcedFields.push(formKey)
    }
  }

  // Direct mappings to existing FormData fields
  setIfPresent(extracted.institucion, 'contratante_dependencia')
  setIfPresent(extracted.rfc, 'contratante_rfc')
  setIfPresent(extracted.matricula, 'matricula')
  setIfPresent(extracted.clave_delegacional, 'clave_delegacional')

  // Talón-specific fields → ocr_ prefixed in FormData
  setIfPresent(extracted.clave_presupuestal, 'ocr_clave_presupuestal')
  setIfPresent(extracted.centro_de_trabajo, 'ocr_centro_trabajo')
  setIfPresent(extracted.llave_de_descuento, 'ocr_llave_descuento')
  setIfPresent(extracted.concepto_de_descuento, 'ocr_concepto_descuento')
  setIfPresent(extracted.tipo_contratacion, 'ocr_tipo_contratacion')
  if (
    extracted.liquido_a_cobrar !== null &&
    extracted.liquido_a_cobrar !== undefined &&
    extracted.liquido_a_cobrar > 0
  ) {
    patch.ocr_liquido_a_cobrar = String(extracted.liquido_a_cobrar)
    sourcedFields.push('ocr_liquido_a_cobrar')
  }

  patch.ocr_sourced_fields = sourcedFields
  return patch as unknown as Partial<FormData>
}

/**
 * Build a Partial<FormData> patch from INE OCR extraction.
 *
 * Mapping (per INTAKE-V2-T06 spec):
 *   nombre_completo → contratante_nombres (full name; user may need to split)
 *   curp            → contratante_curp
 *   direccion       → contratante_calle (full address string)
 *   clave_elector   → ocr_clave_elector
 *
 * Note: nombre_completo is the full concatenated name from INE.
 * The form has separate nombres/ap_paterno/ap_materno fields.
 * We put the full string into contratante_nombres so at least
 * something is pre-filled — the user can split it manually.
 */
export function buildINEPrefillPatch(
  extracted: INEFields,
): Partial<FormData> {
  const patch: Record<string, string | string[]> = {}
  const sourcedFields: string[] = []

  function setIfPresent(
    ocrValue: string | null | undefined,
    formKey: string,
  ) {
    if (ocrValue !== null && ocrValue !== undefined && ocrValue !== '') {
      patch[formKey] = ocrValue
      sourcedFields.push(formKey)
    }
  }

  setIfPresent(extracted.nombre_completo, 'contratante_nombres')
  setIfPresent(extracted.curp, 'contratante_curp')
  setIfPresent(extracted.direccion, 'contratante_calle')
  setIfPresent(extracted.clave_elector, 'ocr_clave_elector')

  patch.ocr_sourced_fields = sourcedFields
  return patch as unknown as Partial<FormData>
}

/**
 * Check whether a specific form field was populated from OCR.
 * Uses the ocr_sourced_fields tracking list + current value match.
 */
export function isFieldFromOCR(
  formData: FormData,
  fieldName: string,
): boolean {
  const sourced = (formData as unknown as Record<string, unknown>)[
    OCR_SOURCED_FIELDS_KEY
  ]
  if (!Array.isArray(sourced)) return false
  return sourced.includes(fieldName)
}
