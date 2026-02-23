'use server'

import { FormData } from '@/lib/types'

const AIRTABLE_BASE = 'app4s0fxoSQStY8Jn'
const AIRTABLE_TABLE = 'tblQx1hUA3JoDgcH0'
const AIRTABLE_API = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`

export async function createAirtableRecord(formData: FormData): Promise<void> {
  const pat = process.env.AIRTABLE_PAT
  if (!pat) {
    console.error('[Airtable] AIRTABLE_PAT env var not set')
    return
  }

  const contratanteNombreCompleto = [
    formData.contratante_nombres,
    formData.contratante_ap_paterno,
    formData.contratante_ap_materno,
  ]
    .filter(Boolean)
    .join(' ')

  // Build NOTAS field with key details
  const notas = [
    `Folio: ${formData.folio}`,
    `Plan: ${formData.plan}`,
    `Periodicidad: ${formData.periodicidad}`,
    formData.prima_base ? `Prima: $${formData.prima_base}` : '',
    formData.suma_asegurada ? `Suma Asegurada: $${formData.suma_asegurada}` : '',
    formData.matricula ? `Matrícula: ${formData.matricula}` : '',
    `Nexos delincuencia: ${formData.nexos_delincuencia || 'no'}`,
    'Gerente comercial: Prospera',
  ]
    .filter(Boolean)
    .join(' | ')

  const fields: Record<string, string> = {
    'Clave Agente': formData.clave_agente || '',
    'Status': 'Solicitud Recibida',
    'Nombre Asegurado': contratanteNombreCompleto,
    'Forma Cobro': formData.forma_cobro || '',
    'Dependencia': formData.contratante_dependencia || '',
    'NOTAS': notas,
  }

  // Remove empty fields to avoid Airtable validation errors
  const cleanFields = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== '')
  )

  const response = await fetch(AIRTABLE_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: cleanFields }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Airtable API error ${response.status}: ${errText}`)
  }

  const result = await response.json()
  console.log(`[Airtable] Record created: ${result.id} for folio ${formData.folio}`)
}
