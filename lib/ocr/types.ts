// ============================================================
// OCR Types — Structured field extraction for talón + INE
// ============================================================

export type OCRDocumentType = 'ine' | 'talon' | 'carta_instruccion' | 'solicitud_page'

// --- Talón de Pago fields ---
export interface TalonFields {
  institucion: string
  clave_presupuestal: string
  centro_de_trabajo: string
  llave_de_descuento: string
  concepto_de_descuento: string   // 195 / 395 / 995 / GNP-SEG / 83 / 341 / G1
  tipo_contratacion: string       // TC code (e.g. "01", "02", "07", "09", "10", "11")
  clave_delegacional: string
  matricula: string
  rfc: string
  folio_fiscal: string
  liquido_a_cobrar: number | null
}

// --- INE fields ---
export interface INEFields {
  nombre_completo: string
  curp: string
  direccion: string
  clave_elector: string
}

// --- Structured OCR result ---
export interface TalonOCRResult {
  provider: string
  type: 'talon'
  confidence: number
  extracted: TalonFields
  warnings?: string[]
  raw_text?: string
}

export interface INEOCRResult {
  provider: string
  type: 'ine'
  confidence: number
  extracted: INEFields
  warnings?: string[]
  raw_text?: string
}

export type StructuredOCRResult = TalonOCRResult | INEOCRResult

// --- Legacy/generic OCR types (kept for backward compat) ---
export interface OCRRequest {
  type: OCRDocumentType
  storagePath?: string
  imageBase64?: string
  imageUrl?: string
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
  extractTalon(imageUrlOrBase64: string): Promise<TalonOCRResult>
  extractINE(imageUrlOrBase64: string): Promise<INEOCRResult>
}

// --- Validation ---
export interface ValidationResult {
  valid: boolean
  errors: string[]
}
