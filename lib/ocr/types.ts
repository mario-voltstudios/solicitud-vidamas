export type OCRDocumentType = 'ine' | 'talon' | 'carta_instruccion' | 'solicitud_page'

export interface OCRRequest {
  type: OCRDocumentType
  storagePath: string
}

export interface OCRResult {
  provider: string
  type: OCRDocumentType
  confidence: number
  extracted: Record<string, unknown>
  warnings?: string[]
}

export interface OCRProvider {
  name: string
  extract(request: OCRRequest): Promise<OCRResult>
}
