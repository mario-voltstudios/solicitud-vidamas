// ============================================================
// OpenAI Vision OCR Provider — Talón de Pago + INE extraction
// ============================================================

import type {
  OCRProvider,
  OCRRequest,
  OCRResult,
  TalonOCRResult,
  INEOCRResult,
  TalonFields,
  INEFields,
} from './types'

const OPENAI_VISION_URL = 'https://api.openai.com/v1/chat/completions'

// --- Prompts ---

const TALON_PROMPT = `You are an expert OCR system for Mexican government payroll receipts ("talón de pago").
Extract the following fields from the image. Return ONLY valid JSON with these exact keys. Use null for fields you cannot confidently read.

Fields to extract:
- institucion: The government institution/dependencia name (e.g. "IMSS", "ISSSTE", "SEP", "GOB CDMX", "UAQ", "Guardia Nacional")
- clave_presupuestal: The budget key number (clave presupuestal), full string including all digits
- centro_de_trabajo: Workplace code or name (centro de trabajo)
- llave_de_descuento: The discount key (llave de descuento) — this is often the employee ID, matrícula, or RFC
- concepto_de_descuento: The discount concept code. Must be one of: "195", "395", "995", "GNP-SEG", "83", "341", "G1"
- tipo_contratacion: The employment type code (tipo de contratación / TC). Usually a 2-digit code like "01", "02", "07", "09", "10", "11"
- clave_delegacional: The delegation key (clave delegacional)
- matricula: Employee registration number (matrícula)
- rfc: The RFC number (Registro Federal de Contribuyentes)
- folio_fiscal: Fiscal receipt number (folio fiscal)
- liquido_a_cobrar: Net payment amount (líquido a cobrar), as a number without currency symbols or commas

Return valid JSON only. Example:
{"institucion":"IMSS","clave_presupuestal":"1101","centro_de_trabajo":"HGR1","llave_de_descuento":"1234567","concepto_de_descuento":"195","tipo_contratacion":"01","clave_delegacional":"V","matricula":"M123456","rfc":"PERG850101ABC","folio_fiscal":"F001-2026","liquido_a_cobrar":8500.50}`

const INE_PROMPT = `You are an expert OCR system for Mexican voter ID cards ("INE - Credencial para Votar").
Extract the following fields from the image. Return ONLY valid JSON with these exact keys. Use null for fields you cannot confidently read.

Fields to extract:
- nombre_completo: Full name in format "Apellido Paterno Apellido Materno Nombre(s)" as printed on the card
- curp: The CURP number (Clave Única de Registro de Población), 18 characters
- direccion: Full address as printed on the card
- clave_elector: The voter key (clave de elector), typically 6 letters + 13 digits

Return valid JSON only. Example:
{"nombre_completo":"PEREZ LOPEZ JUAN CARLOS","curp":"PELJ850101HDFRRN09","direccion":"CALLE 5 123 COL CENTRO CDMX","clave_elector":"PELJCR850101119"}`

// --- Helpers ---

function parseJsonFromResponse(content: string): Record<string, unknown> {
  // OpenAI may wrap JSON in markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content]
  const jsonStr = (jsonMatch[1] || content).trim()
  try {
    return JSON.parse(jsonStr)
  } catch {
    return {}
  }
}

function isImageUrl(input: string): boolean {
  return input.startsWith('http://') || input.startsWith('https://')
}

function buildImageContent(imageUrlOrBase64: string): {
  type: 'image_url'
  image_url: { url: string }
} {
  if (isImageUrl(imageUrlOrBase64)) {
    return {
      type: 'image_url',
      image_url: { url: imageUrlOrBase64 },
    }
  }
  // Assume base64 — prefix with data URI if not already
  const dataUrl = imageUrlOrBase64.startsWith('data:')
    ? imageUrlOrBase64
    : `data:image/jpeg;base64,${imageUrlOrBase64}`
  return {
    type: 'image_url',
    image_url: { url: dataUrl },
  }
}

async function callOpenAIVision(
  prompt: string,
  imageUrlOrBase64: string
): Promise<{ content: string; usage?: Record<string, unknown> }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const imageContent = buildImageContent(imageUrlOrBase64)

  const response = await fetch(OPENAI_VISION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all fields from this document image. Return ONLY valid JSON.',
            },
            imageContent,
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI Vision API error (${response.status}): ${error}`)
  }

  const data = await response.json()
  return {
    content: data.choices?.[0]?.message?.content ?? '{}',
    usage: data.usage,
  }
}

// --- Default empty fields ---

const EMPTY_TALON: TalonFields = {
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

const EMPTY_INE: INEFields = {
  nombre_completo: '',
  curp: '',
  direccion: '',
  clave_elector: '',
}

// --- Provider ---

export class OpenAIVisionProvider implements OCRProvider {
  name = 'openai-vision'

  async extract(request: OCRRequest): Promise<OCRResult> {
    const input = request.imageUrl || request.imageBase64 || request.storagePath || ''
    if (!input) {
      throw new Error('No image input provided (need imageUrl, imageBase64, or storagePath)')
    }

    if (request.type === 'talon') {
      const result = await this.extractTalon(input)
      return {
        provider: result.provider,
        type: 'talon',
        confidence: result.confidence,
        extracted: result.extracted as unknown as Record<string, unknown>,
        warnings: result.warnings,
      }
    }

    if (request.type === 'ine') {
      const result = await this.extractINE(input)
      return {
        provider: result.provider,
        type: 'ine',
        confidence: result.confidence,
        extracted: result.extracted as unknown as Record<string, unknown>,
        warnings: result.warnings,
      }
    }

    throw new Error(`Unsupported document type: ${request.type}`)
  }

  async extractTalon(imageUrlOrBase64: string): Promise<TalonOCRResult> {
    const warnings: string[] = []

    const { content } = await callOpenAIVision(TALON_PROMPT, imageUrlOrBase64)
    const parsed = parseJsonFromResponse(content)

    const fields: TalonFields = { ...EMPTY_TALON }

    if (parsed.institucion) fields.institucion = String(parsed.institucion).trim()
    if (parsed.clave_presupuestal) fields.clave_presupuestal = String(parsed.clave_presupuestal).trim()
    if (parsed.centro_de_trabajo) fields.centro_de_trabajo = String(parsed.centro_de_trabajo).trim()
    if (parsed.llave_de_descuento) fields.llave_de_descuento = String(parsed.llave_de_descuento).trim()
    if (parsed.concepto_de_descuento) fields.concepto_de_descuento = String(parsed.concepto_de_descuento).trim().toUpperCase()
    if (parsed.tipo_contratacion) fields.tipo_contratacion = String(parsed.tipo_contratacion).trim()
    if (parsed.clave_delegacional) fields.clave_delegacional = String(parsed.clave_delegacional).trim()
    if (parsed.matricula) fields.matricula = String(parsed.matricula).trim()
    if (parsed.rfc) fields.rfc = String(parsed.rfc).trim().toUpperCase()
    if (parsed.folio_fiscal) fields.folio_fiscal = String(parsed.folio_fiscal).trim()

    // Parse liquido as number
    if (parsed.liquido_a_cobrar !== null && parsed.liquido_a_cobrar !== undefined) {
      const num = Number(String(parsed.liquido_a_cobrar).replace(/[, $]/g, ''))
      fields.liquido_a_cobrar = isNaN(num) ? null : num
    }

    // Confidence: count how many fields were successfully extracted
    const filledCount = Object.values(fields).filter(
      (v) => v !== null && v !== ''
    ).length
    const confidence = filledCount / Object.keys(EMPTY_TALON).length

    if (confidence < 0.5) {
      warnings.push('Low confidence: fewer than half of talón fields extracted')
    }

    return {
      provider: this.name,
      type: 'talon',
      confidence,
      extracted: fields,
      warnings: warnings.length > 0 ? warnings : undefined,
      raw_text: content,
    }
  }

  async extractINE(imageUrlOrBase64: string): Promise<INEOCRResult> {
    const warnings: string[] = []

    const { content } = await callOpenAIVision(INE_PROMPT, imageUrlOrBase64)
    const parsed = parseJsonFromResponse(content)

    const fields: INEFields = { ...EMPTY_INE }

    if (parsed.nombre_completo) fields.nombre_completo = String(parsed.nombre_completo).trim()
    if (parsed.curp) fields.curp = String(parsed.curp).trim().toUpperCase()
    if (parsed.direccion) fields.direccion = String(parsed.direccion).trim()
    if (parsed.clave_elector) fields.clave_elector = String(parsed.clave_elector).trim().toUpperCase()

    const filledCount = Object.values(fields).filter(
      (v) => v !== null && v !== ''
    ).length
    const confidence = filledCount / Object.keys(EMPTY_INE).length

    if (confidence < 0.5) {
      warnings.push('Low confidence: fewer than half of INE fields extracted')
    }

    return {
      provider: this.name,
      type: 'ine',
      confidence,
      extracted: fields,
      warnings: warnings.length > 0 ? warnings : undefined,
      raw_text: content,
    }
  }
}

// --- Factory ---

export function getOCRProvider(): OCRProvider {
  return new OpenAIVisionProvider()
}
