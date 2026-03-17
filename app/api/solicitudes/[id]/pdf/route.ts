import { NextRequest, NextResponse } from 'next/server'
import { generateAndStoreSolicitudPdf } from '@/lib/pdf-generator'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await generateAndStoreSolicitudPdf(id)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error generating PDF',
      },
      { status: 500 }
    )
  }
}
