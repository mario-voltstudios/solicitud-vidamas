// ============================================================
// OCR Extract — Entry point for document extraction
// ============================================================

import { getOCRProvider } from './provider'
import type {
  OCRDocumentType,
  OCRRequest,
  OCRResult,
  TalonOCRResult,
  INEOCRResult,
  TalonFields,
  INEFields,
  ValidationResult,
} from './types'
import { validateTalonFields, validateINEFields } from './validation'

export interface ExtractOptions {
  type: OCRDocumentType
  imageUrl?: string
  imageBase64?: string
  storagePath?: string
  validate?: boolean
}

export interface ExtractedDocument<T> {
  result: T
  validation: ValidationResult | null
}

/**
 * Generic extraction — works for any document type.
 * Returns OCRResult with flat extracted record.
 */
export async function extractDocument(options: ExtractOptions): Promise<OCRResult> {
  const provider = getOCRProvider()
  const request: OCRRequest = {
    type: options.type,
    imageUrl: options.imageUrl,
    imageBase64: options.imageBase64,
    storagePath: options.storagePath,
  }
  return provider.extract(request)
}

/**
 * Structured extraction for talón de pago.
 * Returns validated TalonFields.
 */
export async function extractTalon(
  imageUrlOrBase64: string,
  options?: { validate?: boolean }
): Promise<ExtractedDocument<TalonOCRResult>> {
  const provider = getOCRProvider()
  const result = await provider.extractTalon(imageUrlOrBase64)

  const validation = options?.validate !== false
    ? validateTalonFields(result.extracted)
    : null

  return { result, validation }
}

/**
 * Structured extraction for INE.
 * Returns validated INEFields.
 */
export async function extractINE(
  imageUrlOrBase64: string,
  options?: { validate?: boolean }
): Promise<ExtractedDocument<INEOCRResult>> {
  const provider = getOCRProvider()
  const result = await provider.extractINE(imageUrlOrBase64)

  const validation = options?.validate !== false
    ? validateINEFields(result.extracted)
    : null

  return { result, validation }
}

// Re-export types and validation for convenience
export type { TalonFields, INEFields, TalonOCRResult, INEOCRResult, ValidationResult }
export { validateTalonFields, validateINEFields, validateRFC, validateCURP } from './validation'
