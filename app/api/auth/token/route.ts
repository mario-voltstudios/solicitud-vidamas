import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json(
      { error: 'Token requerido' },
      { status: 400 }
    )
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('agentes')
    .select('clave, nombre_completo, correo, tiene_cedula, rfc, nombre_corto')
    .eq('magic_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Este enlace no es válido o ha expirado' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    success: true,
    agente: {
      clave: data.clave,
      nombre_completo: data.nombre_completo,
      correo: data.correo,
      tiene_cedula: data.tiene_cedula,
      rfc: data.rfc,
    },
  })
}
