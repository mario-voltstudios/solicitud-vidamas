import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifyVideo, type VerificationInput } from '@/lib/video/verification'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min for video analysis

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const solicitudId = String(body?.solicitudId || '').trim()
    const videoS3Key = String(body?.videoS3Key || '').trim()

    if (!solicitudId) {
      return NextResponse.json({ success: false, error: 'solicitudId requerido' }, { status: 400 })
    }
    if (!videoS3Key) {
      return NextResponse.json({ success: false, error: 'videoS3Key requerido' }, { status: 400 })
    }

    // Fetch solicitud data for verification context
    const supabase = createServerClient()

    const { data: solicitud, error: fetchErr } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('id', solicitudId)
      .single()

    if (fetchErr || !solicitud) {
      return NextResponse.json({ success: false, error: 'Solicitud no encontrada' }, { status: 404 })
    }

    // Fetch beneficiaries
    const { data: beneficiaries } = await supabase
      .from('solicitud_beneficiarios')
      .select('nombre, porcentaje')
      .eq('solicitud_id', solicitudId)

    const input: VerificationInput = {
      solicitudId,
      videoS3Key,
      aseguradoNombre: solicitud.asegurado_nombres || '',
      aseguradoApPaterno: solicitud.asegurado_ap_paterno || '',
      aseguradoApMaterno: solicitud.asegurado_ap_materno || '',
      agentName: solicitud.nombre_agente || '',
      primaQuincenal: Number(solicitud.prima_quincenal || 0),
      beneficiaries: (beneficiaries || []).map(b => ({
        nombre: b.nombre,
        porcentaje: Number(b.porcentaje),
      })),
      uploadTimestamp: Date.now(),
    }

    const result = await verifyVideo(input)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error en verificación de video'
    console.error('[Video Verify] Failed:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
