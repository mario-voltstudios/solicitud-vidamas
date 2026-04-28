import type { StructuredOCRResult } from './types'

export type OCRPersistenceStatus = 'skipped' | 'pending' | 'processing' | 'done' | 'failed'
export type OCRPersistenceDocumentType = 'talon' | 'ine'

export interface OCRPersistencePatch {
  ocr_state: OCRPersistenceStatus
  ocr_at?: string | null
  ocr_payload?: StructuredOCRResult | null
  ocr_data?: StructuredOCRResult['extracted'] | null
  ocr_raw?: string | null
  ocr_error?: string | null
  ocr_errors?: string[]
  ocr_confidence?: number | null
  ocr_provider?: string | null
  ocr_model?: string | null
  ocr_document_type?: OCRPersistenceDocumentType | null
  ocr_processed_at?: string | null
}

export function buildOCRSuccessPersistencePatch(
  result: StructuredOCRResult,
  processedAt = new Date().toISOString(),
): OCRPersistencePatch {
  return {
    ocr_state: 'done',
    ocr_at: processedAt,
    ocr_payload: result,
    ocr_data: result.extracted,
    ocr_raw: result.raw_text ?? null,
    ocr_error: null,
    ocr_errors: result.warnings ?? [],
    ocr_confidence: result.confidence,
    ocr_provider: result.provider,
    ocr_model: null,
    ocr_document_type: result.type,
    ocr_processed_at: processedAt,
  }
}

export function buildOCRFailurePersistencePatch(
  error: string,
  documentType: OCRPersistenceDocumentType,
  processedAt = new Date().toISOString(),
): OCRPersistencePatch {
  return {
    ocr_state: 'failed',
    ocr_at: processedAt,
    ocr_payload: null,
    ocr_data: null,
    ocr_raw: null,
    ocr_error: error,
    ocr_errors: [error],
    ocr_confidence: null,
    ocr_provider: null,
    ocr_model: null,
    ocr_document_type: documentType,
    ocr_processed_at: processedAt,
  }
}
