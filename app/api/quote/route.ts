import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export interface QuoteRequest {
  plan: string
  prima_quincenal: number
  edad_real: number
  genero: string
  no_fumar: boolean
  risk_type?: string
}

export interface QuoteResult {
  suma_asegurada: number
  edad_calculo: number
  descuentos_aplicados: string[]
  prima_quincenal: number
  plan: string
  risk_type: string
  data_quality: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as QuoteRequest

    // Validate required fields
    if (!body.plan) {
      return NextResponse.json(
        { success: false, error: 'Plan es requerido' },
        { status: 400 }
      )
    }
    if (!body.prima_quincenal || body.prima_quincenal <= 0) {
      return NextResponse.json(
        { success: false, error: 'Prima quincenal debe ser mayor a 0' },
        { status: 400 }
      )
    }
    if (!body.edad_real || body.edad_real < 15 || body.edad_real > 65) {
      return NextResponse.json(
        { success: false, error: 'Edad debe estar entre 15 y 65 años' },
        { status: 400 }
      )
    }
    if (!body.genero || !['M', 'F'].includes(body.genero)) {
      return NextResponse.json(
        { success: false, error: 'Género debe ser M o F' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    const { data, error } = await supabase.rpc('get_vida_mas_quote', {
      p_plan: body.plan,
      p_prima_quincenal: body.prima_quincenal,
      p_edad_real: body.edad_real,
      p_genero: body.genero,
      p_no_fumar: body.no_fumar ?? true,
      p_risk_type: body.risk_type ?? 'estandar',
    })

    if (error) {
      console.error('Quote RPC error:', error)
      return NextResponse.json(
        { success: false, error: 'Error al calcular cotización' },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se encontró tarifa para los parámetros dados' },
        { status: 404 }
      )
    }

    const quote = data[0] as QuoteResult

    return NextResponse.json({
      success: true,
      quote,
    })
  } catch (err) {
    console.error('Quote API error:', err)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
