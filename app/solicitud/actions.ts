'use server'

import { createServerClient } from '@/lib/supabase'
import { FormData } from '@/lib/types'
import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { appendToSheet } from '@/lib/google-sheets'
import { createAirtableRecord } from '@/lib/airtable'
import { backupFilesToDrive } from '@/lib/google-drive'
import { getUploadedDocs } from '@/lib/dependencia-rules'
import { deriveIntakeStatus } from '@/lib/intake-status'
import { runIntakeFiltro } from '@/lib/filtro-calidad/intake-hook'

const INEDataSchema = z.object({
  nombres: z.string().describe('First name(s) of the person'),
  apellido_paterno: z.string().describe('Paternal last name'),
  apellido_materno: z.string().describe('Maternal last name'),
  fecha_nacimiento: z.string().describe('Date of birth in YYYY-MM-DD format'),
  sexo: z.enum(['M', 'F']).describe('Sex: M for masculino, F for femenino'),
  curp: z.string().describe('CURP (18 characters)'),
  clave_elector: z.string().describe('Clave de elector (voter key)'),
  domicilio: z.object({
    calle: z.string().describe('Street name'),
    numero: z.string().describe('Street number'),
    colonia: z.string().describe('Neighborhood/colonia'),
    cp: z.string().describe('Postal code (5 digits)'),
    municipio: z.string().describe('Municipality or borough'),
    estado: z.string().describe('State name'),
  }),
})

export async function extractINEData(imageBase64: string, mimeType: string) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] INE OCR request received. mimeType=${mimeType}, base64Length=${imageBase64?.length || 0}`)
  
  if (!imageBase64 || imageBase64.length < 100) {
    console.error(`[${timestamp}] INE OCR: base64 data too short or empty`)
    return { success: false, error: 'Imagen vacía o corrupta. Intenta de nuevo.' }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`[${timestamp}] INE OCR: ANTHROPIC_API_KEY not set!`)
    return { success: false, error: 'Error de configuración del servidor. Contacta al administrador.' }
  }

  try {
    const isPDF = mimeType === 'application/pdf'
    
    console.log(`[${timestamp}] INE OCR: calling Anthropic Claude vision... isPDF=${isPDF}`)
    
    const promptText = 'Extract all data from this Mexican INE (credencial para votar) front. Return all fields in UPPERCASE. For fecha_nacimiento use YYYY-MM-DD format. If a field is not visible or unclear, return an empty string.'
    
    // Build messages based on file type
    const messages = isPDF
      ? [
          {
            role: 'user' as const,
            content: [
              {
                type: 'file' as const,
                data: imageBase64,
                mimeType: 'application/pdf' as const,
                mediaType: 'application/pdf' as const,
              },
              { type: 'text' as const, text: promptText },
            ],
          },
        ]
      : [
          {
            role: 'user' as const,
            content: [
              {
                type: 'image' as const,
                image: `data:${mimeType};base64,${imageBase64}`,
              },
              { type: 'text' as const, text: promptText },
            ],
          },
        ]
    
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-20250514'),
      schema: INEDataSchema,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
    })
    console.log(`[${timestamp}] INE OCR success: ${object.nombres} ${object.apellido_paterno}`)
    return { success: true, data: object }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error ? error.stack : ''
    console.error(`[${timestamp}] INE OCR error: ${errMsg}`)
    console.error(`[${timestamp}] INE OCR stack: ${errStack}`)
    return { 
      success: false, 
      error: `Error al procesar INE: ${errMsg.substring(0, 100)}. Llena los datos manualmente.` 
    }
  }
}

export async function validateAgente(clave: string) {
  const supabase = createServerClient()
  
  const { data, error } = await supabase
    .from('agentes')
    .select('id, clave, nombre_completo, nombre_corto, status')
    .eq('clave', clave)
    .single()

  if (error || !data) {
    return { success: false, error: 'Clave de agente no encontrada' }
  }

  return { success: true, agente: data }
}

export async function getCurrentSemana() {
  const supabase = createServerClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('semanas')
    .select('*')
    .lte('start_date', today)
    .gte('end_date', today)
    .single()

  if (error || !data) {
    // Fallback: get latest semana
    const { data: latest } = await supabase
      .from('semanas')
      .select('*')
      .order('year', { ascending: false })
      .order('week_number', { ascending: false })
      .limit(1)
      .single()
    return latest
  }

  return data
}

export async function generateFolio(clave_agente: string, semana: { year: number; week_number: number }) {
  const supabase = createServerClient()
  
  // Count existing submissions for this agent+week
  const folioPrefix = `${clave_agente}-${semana.year}-S${semana.week_number}-`
  const { count } = await supabase
    .from('solicitudes')
    .select('*', { count: 'exact', head: true })
    .like('folio', `${folioPrefix}%`)

  const increment = (count || 0) + 1
  return `${folioPrefix}${increment}`
}

export async function submitSolicitud(formData: FormData) {
  // Server-side validation: require signature
  if (!formData.firma_base64 || !formData.firma_base64.startsWith('data:image/')) {
    return { success: false, error: 'Firma requerida. Por favor firma antes de enviar.' }
  }

  // Server-side validation: require essential fields
  if (!formData.clave_agente) {
    return { success: false, error: 'Clave de agente requerida.' }
  }
  if (!formData.contratante_nombres || !formData.contratante_ap_paterno) {
    return { success: false, error: 'Datos del contratante incompletos.' }
  }

  const supabase = createServerClient()

  const intake = deriveIntakeStatus(formData)
  const intakeStatus = intake.status

  // Re-generate folio at submit time to avoid duplicates
  // (folio from Step 1 was generated before record existed)
  let finalFolio = formData.folio
  if (formData.clave_agente && formData.year && formData.week_number) {
    if (formData.contratante_rfc) {
      const { data: existingDuplicate } = await supabase
        .from('solicitudes')
        .select('id, folio, status')
        .eq('clave_agente', formData.clave_agente)
        .eq('contratante_rfc', formData.contratante_rfc)
        .eq('week_number', formData.week_number)
        .eq('year', formData.year)
        .limit(1)
        .maybeSingle()

      if (existingDuplicate) {
        return {
          success: false,
          error: `Ya existe una solicitud similar para este agente y RFC en la semana actual (${existingDuplicate.folio}).`,
        }
      }
    }

    finalFolio = await generateFolio(formData.clave_agente, {
      year: formData.year,
      week_number: formData.week_number,
    })
  }

  const payload = {
    folio: finalFolio,
    clave_agente: formData.clave_agente,
    status: intakeStatus,
    // contratante
    contratante_nombres: formData.contratante_nombres || null,
    contratante_ap_paterno: formData.contratante_ap_paterno || null,
    contratante_ap_materno: formData.contratante_ap_materno || null,
    contratante_fecha_nac: formData.contratante_fecha_nac || null,
    contratante_genero: formData.contratante_genero || null,
    contratante_rfc: formData.contratante_rfc || null,
    contratante_curp: formData.contratante_curp || null,
    contratante_tipo_id: formData.contratante_tipo_id || null,
    contratante_num_id: formData.contratante_num_id || null,
    contratante_email: formData.contratante_email || null,
    contratante_telefono: formData.contratante_telefono || null,
    contratante_calle: formData.contratante_calle || null,
    contratante_num_ext: formData.contratante_num_ext || null,
    contratante_num_int: formData.contratante_num_int || null,
    contratante_cp: formData.contratante_cp || null,
    contratante_colonia: formData.contratante_colonia || null,
    contratante_estado: formData.contratante_estado || null,
    contratante_municipio: formData.contratante_municipio || null,
    contratante_ocupacion: formData.contratante_ocupacion || null,
    contratante_dependencia: formData.contratante_dependencia || null,
    nexos_delincuencia: formData.nexos_delincuencia || 'no',
    gerente_comercial: 'Prospera',
    // cobro
    forma_cobro: formData.forma_cobro || null,
    clave_delegacional: formData.clave_delegacional || null,
    matricula: formData.matricula || null,
    sub_dependencia: formData.sub_dependencia || null,
    folio_contrato: formData.folio_contrato || null,
    clabe: formData.clabe || null,
    banco: formData.banco || null,
    fecha_inicio_cobro: formData.fecha_inicio_cobro || null,
    // asegurado
    misma_persona: formData.misma_persona,
    asegurado_nombres: formData.misma_persona ? formData.contratante_nombres : formData.asegurado_nombres || null,
    asegurado_ap_paterno: formData.misma_persona ? formData.contratante_ap_paterno : formData.asegurado_ap_paterno || null,
    asegurado_ap_materno: formData.misma_persona ? formData.contratante_ap_materno : formData.asegurado_ap_materno || null,
    asegurado_fecha_nac: formData.misma_persona ? formData.contratante_fecha_nac : formData.asegurado_fecha_nac || null,
    asegurado_genero: formData.misma_persona ? formData.contratante_genero : formData.asegurado_genero || null,
    asegurado_rfc: formData.misma_persona ? formData.contratante_rfc : formData.asegurado_rfc || null,
    // plan
    plan: formData.plan || null,
    periodicidad: formData.periodicidad || null,
    prima_base: formData.prima_base ? parseFloat(formData.prima_base) : null,
    prima_adicional: formData.prima_adicional ? parseFloat(formData.prima_adicional) : null,
    suma_asegurada: formData.suma_asegurada ? parseFloat(formData.suma_asegurada) : null,
    base_calculo: formData.base_calculo || null,
    nombre_agente: formData.nombre_agente || null,
    week_number: formData.week_number || null,
    year: formData.year || null,
    // beneficiarios
    beneficiarios: formData.beneficiarios || [],
    // firma
    firma_base64: formData.firma_base64 || null,
    fecha_firma: new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
  }

  // ── Filtro de Calidad — Intake Gate ───────────────────────────────────────
  // Hard stops block submission entirely. Flags are logged but do not block.
  // Quality persistence failures are non-blocking (swallowed inside the hook).
  const filtroResult = await runIntakeFiltro(formData, supabase)
  if (filtroResult.blocked) {
    return {
      success: false,
      error: filtroResult.summary_text,
      filtroFindings: filtroResult.findings,
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const { data, error } = await supabase
    .from('solicitudes')
    .insert(payload)
    .select('id, folio')
    .single()

  if (error) {
    console.error('Submit error:', error)
    return { success: false, error: error.message }
  }

  const docs = getUploadedDocs(formData)
  const documentRows = Object.entries(docs)
    .filter(([, storagePath]) => Boolean(storagePath))
    .map(([docType, storagePath]) => ({
      solicitud_id: data.id,
      doc_type: docType,
      storage_path: storagePath,
      upload_state: 'uploaded',
      upload_at: new Date().toISOString(),
      ocr_state: ['ine_frente', 'ine_reverso', 'talon'].includes(docType) ? 'pending' : 'skipped',
      backup_state: 'pending',
      created_by: formData.clave_agente || 'wizard',
    }))

  if (documentRows.length > 0) {
    const { error: docsError } = await supabase
      .from('solicitud_documentos')
      .insert(documentRows)

    if (docsError) {
      console.error('Document tracking insert error:', docsError)
    }
  }

  // ── Async backups (fire-and-forget, do NOT await) ─────────────────────────
  // Use the final folio (server-generated) for all backups
  const backupData = { ...formData, folio: data.folio }

  // 1. Google Sheets backup
  appendToSheet(backupData).catch((err) =>
    console.error('[Backup] Google Sheets failed:', err)
  )

  // 2. Airtable backup
  createAirtableRecord(backupData).catch((err) =>
    console.error('[Backup] Airtable failed:', err)
  )

  // 3. Google Drive file backup — collect all docs_ fields from formData
  const driveDocs: Record<string, string> = {}
  const docKeys = [
    'ine_frente', 'ine_reverso', 'talon',
    'carta_instruccion', 'constancia_derechohabiente', 'clave_unica_pago',
    'solicitud_p1', 'solicitud_p2', 'solicitud_p3',
    'solicitud_p4', 'solicitud_p5', 'solicitud_p6',
    'video',
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fd = formData as any
  for (const key of docKeys) {
    const path = fd[`docs_${key}`]
    if (path) driveDocs[key] = path
  }
  if (Object.keys(driveDocs).length > 0) {
    backupFilesToDrive(data.folio, driveDocs).catch((err) =>
      console.error('[Backup] Google Drive failed:', err)
    )
  }
  // ─────────────────────────────────────────────────────────────────────────

  return {
    success: true,
    id: data.id,
    folio: data.folio,
    status: intakeStatus,
    missingRequiredDocs: intake.missingDocs,
    missingVerification: intake.missingVerification,
  }
}
