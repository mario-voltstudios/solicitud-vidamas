// ============================================================
// POST /api/ocr/extract — Extract fields from talón or INE
// ============================================================
//
// Request body:
//   { type: "talon" | "ine", imageUrl?: string, imageBase64?: string }
//   At least one of imageUrl or imageBase64 must be provided.
//
// Response:
//   { success: true, data: { extracted, confidence, validation, warnings } }
//   { success: false, error: string }

import { NextRequest, NextResponse } from 'next/server'
import { extractTalon, extractINE } from '@/lib/ocr/extract'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, imageUrl, imageBase64 } = body

    if (!type || !['talon', 'ine'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'type must be "talon" or "ine"' },
        { status: 400 }
      )
    }

    if (!imageUrl && !imageBase64) {
      return NextResponse.json(
        { success: false, error: 'Provide imageUrl or imageBase64' },
        { status: 400 }
      )
    }

    const input = imageUrl || imageBase64

    if (type === 'talon') {
      const { result, validation } = await extractTalon(input, { validate: true })
      return NextResponse.json({
        success: true,
        data: {
          type: 'talon',
          extracted: result.extracted,
          confidence: result.confidence,
          validation,
          warnings: result.warnings ?? [],
          provider: result.provider,
        },
      })
    }

    // type === 'ine'
    const { result, validation } = await extractINE(input, { validate: true })
    return NextResponse.json({
      success: true,
      data: {
        type: 'ine',
        extracted: result.extracted,
        confidence: result.confidence,
        validation,
        warnings: result.warnings ?? [],
        provider: result.provider,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OCR error'
    console.error('[OCR/extract]', message)
    return NextResponse.json(
      {
        success: false,
        error: 'OCR extraction failed',
        code: 'OCR_PROVIDER_ERROR',
      },
      { status: 502 }
    )
  }
}
