import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { randomBytes } from 'crypto'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://solicitud-vidamas.vercel.app'

export async function POST(request: Request) {
  // Auth check
  const adminSecret = request.headers.get('x-admin-secret')
  if (!adminSecret || adminSecret !== process.env.MARIO_OVERRIDE_SECRET) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    )
  }

  let body: { clave_agente?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Body JSON requerido' },
      { status: 400 }
    )
  }

  const { clave_agente } = body
  if (!clave_agente) {
    return NextResponse.json(
      { error: 'clave_agente requerido' },
      { status: 400 }
    )
  }

  const supabase = createServerClient()

  // Verify agent exists
  const { data: agente, error: findError } = await supabase
    .from('agentes')
    .select('clave, nombre_completo')
    .eq('clave', clave_agente)
    .single()

  if (findError || !agente) {
    return NextResponse.json(
      { error: 'Agente no encontrado' },
      { status: 404 }
    )
  }

  // Generate 32-char hex token
  const token = randomBytes(16).toString('hex')

  // Update agent with new token
  const { error: updateError } = await supabase
    .from('agentes')
    .update({
      magic_token: token,
      magic_token_created_at: new Date().toISOString(),
    })
    .eq('clave', clave_agente)

  if (updateError) {
    console.error('Token generation error:', updateError)
    return NextResponse.json(
      { error: 'Error al generar token' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    token,
    url: `${SITE_URL}/solicitud?token=${token}`,
    agente: agente.nombre_completo,
  })
}
