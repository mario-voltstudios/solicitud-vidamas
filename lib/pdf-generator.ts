import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createServerClient } from '@/lib/supabase'
import type { FormData, Beneficiario } from '@/lib/types'

const TEMPLATE_PATH = process.env.PDF_TEMPLATE_PATH
  || path.join(process.cwd(), 'templates', 'gnp-solicitud-vida-template.pdf')
const STORAGE_BUCKET = 'solicitud-docs'
const GENERATED_DOC_TYPE = 'solicitud_pdf_generada'

type MaybeString = string | number | null | undefined

function text(v: unknown) {
  return v == null ? '' : String(v)
}

function upper(v: unknown) {
  return text(v).trim().toUpperCase()
}

function last3(v: unknown) {
  const s = upper(v)
  return s ? s.slice(-3) : ''
}

function splitDate(value?: string | null) {
  if (!value) return { dd: '', mm: '', yyyy: '' }
  const [yyyy = '', mm = '', dd = ''] = value.split('-')
  return { dd, mm, yyyy }
}


function setTextField(form: ReturnType<typeof PDFDocument.prototype.getForm>, fieldName: string, value: MaybeString) {
  try {
    const field = form.getTextField(fieldName)
    field.setText(text(value))
  } catch {
    // best effort; field names are template-coupled
  }
}

function setCheckbox(form: ReturnType<typeof PDFDocument.prototype.getForm>, fieldName: string, checked: boolean) {
  try {
    const field = form.getCheckBox(fieldName)
    if (checked) field.check()
    else field.uncheck()
  } catch {
    // best effort; field names are template-coupled
  }
}

function setBeneficiarioFields(form: ReturnType<typeof PDFDocument.prototype.getForm>, beneficiarios: Beneficiario[] = []) {
  const bens = beneficiarios.slice(0, 5)
  const nameFields = [
    ['Text10', 'Text11', 'Text12'],
    ['Text13', 'Text14', 'Text15'],
    ['Text16', 'Text17', 'Text18'],
    ['Text19', 'Text20', 'Text21'],
    ['Text22', 'Text23', 'Text24'],
  ]
  const parFields = ['Parentesco1', 'Parentesco2', 'Parentesco3', 'Parentesco4', 'Parentesco5']
  const saFields = ['SA_1', 'SA_2', 'SA_3', 'SA_4', 'SA_5']
  const dateFields = [
    ['1', '2', '3'],
    ['1_2', '2_2', '3_2'],
    ['1_3', '2_3', '3_3'],
    ['1_4', '2_4', '3_4'],
    ['5', '5_2', '4_4'],
  ]

  bens.forEach((b, idx) => {
    const [ap1, ap2, nombres] = nameFields[idx] || []
    if (ap1) setTextField(form, ap1, upper(b.ap_paterno))
    if (ap2) setTextField(form, ap2, upper(b.ap_materno))
    if (nombres) setTextField(form, nombres, upper(b.nombres))
    if (parFields[idx]) setTextField(form, parFields[idx], upper(b.parentesco))
    if (saFields[idx]) setTextField(form, saFields[idx], b.porcentaje)
    const { dd, mm, yyyy } = splitDate(b.fecha_nac)
    const [dField, mField, yField] = dateFields[idx] || []
    if (dField) setTextField(form, dField, dd)
    if (mField) setTextField(form, mField, mm)
    if (yField) setTextField(form, yField, yyyy)
  })
}

export async function buildSolicitudPdf(fd: FormData) {
  const templateBytes = await fs.readFile(TEMPLATE_PATH)
  const pdfDoc = await PDFDocument.load(templateBytes)
  const form = pdfDoc.getForm()

  const contratanteDob = splitDate(fd.contratante_fecha_nac)
  const aseguradoDob = splitDate(fd.asegurado_fecha_nac)
  const fechaCobro = splitDate(fd.fecha_inicio_cobro)

  // Page 1 — Contratante
  setTextField(form, 'Folio del solicitud', upper(fd.folio))
  setTextField(form, 'RFC ejecutivo', upper(fd.clave_agente))
  setTextField(form, 'Nombre (s)', upper(fd.contratante_nombres))
  setTextField(form, 'Primer apellido', upper(fd.contratante_ap_paterno))
  setTextField(form, 'Segundo apellido', upper(fd.contratante_ap_materno))
  setTextField(form, 'Fecha_1', contratanteDob.dd)
  setTextField(form, 'Fecha_1_1', contratanteDob.mm)
  setTextField(form, 'Fecha_1_2', contratanteDob.yyyy)
  setTextField(form, 'CURP', upper(fd.contratante_curp))
  setTextField(form, 'homoclave', last3(fd.contratante_rfc))
  setCheckbox(form, 'Check Box1', upper(fd.contratante_genero) === 'M')
  setCheckbox(form, 'Check Box2', upper(fd.contratante_genero) === 'F')
  setTextField(form, 'Calle', upper(fd.contratante_calle))
  setTextField(form, 'Número exterior', upper(fd.contratante_num_ext))
  setTextField(form, 'Número interior', upper(fd.contratante_num_int))
  setTextField(form, 'Código Postal', fd.contratante_cp)
  setTextField(form, 'Colonia', upper(fd.contratante_colonia))
  setTextField(form, 'Municipio o Alcaldía', upper(fd.contratante_municipio))
  setTextField(form, 'Entidad Federativa', upper(fd.contratante_estado))
  setTextField(form, 'País', upper(fd.contratante_pais || 'MEXICO'))
  setTextField(form, 'Teléfono móvil', fd.contratante_telefono)
  setTextField(form, 'Correo electrónico', fd.contratante_email)
  setTextField(form, 'Ocupación actual', upper(fd.contratante_ocupacion))
  setTextField(form, 'Nacionalidad', upper(fd.contratante_nacionalidad))
  setTextField(form, 'Régimen Fiscal', upper(fd.contratante_regimen_fiscal))
  setTextField(form, 'Entidad Federativa y País de nacimiento', upper(fd.contratante_lugar_nacimiento))
  setTextField(form, 'No de identifcación fiscal y País emisor solo extranjeros', upper(fd.contratante_identificacion_fiscal_extranjero))
  setTextField(form, 'Tipo de identificación contratante', upper(fd.contratante_tipo_id))
  setTextField(form, 'Entidad emisora contratante', upper(fd.contratante_id_emisor))
  setTextField(form, 'Folio no de identificaión contratante', upper(fd.contratante_num_id))
  setTextField(form, 'Nombre de la dependencia', upper(fd.contratante_dependencia))
  setTextField(form, 'Nombre de la subdependencia', upper(fd.sub_dependencia))

  // Page 1 — Asegurado (blank on PDF when misma_persona=true)
  if (!fd.misma_persona) {
    setTextField(form, 'Nombre (s)_2', upper(fd.asegurado_nombres))
    setTextField(form, 'Primer apellido_2', upper(fd.asegurado_ap_paterno))
    setTextField(form, 'Segundo apellido_2', upper(fd.asegurado_ap_materno))
    setTextField(form, 'Fecha_2', aseguradoDob.dd)
    setTextField(form, 'Fecha_2_1', aseguradoDob.mm)
    setTextField(form, 'Fecha_2_2', aseguradoDob.yyyy)
    setTextField(form, 'CURP_2', upper(fd.asegurado_rfc))
    setTextField(form, 'homoclave_2', last3(fd.asegurado_rfc))
    setCheckbox(form, 'Check Box3', upper(fd.asegurado_genero) === 'M')
    setCheckbox(form, 'Check Box4', upper(fd.asegurado_genero) === 'F')
    setTextField(form, 'Número exterior_2', upper(fd.asegurado_num_ext))
    setTextField(form, 'Número interior_2', upper(fd.asegurado_num_int))
    setTextField(form, 'Código Postal_2', fd.asegurado_cp)
    setTextField(form, 'Colonia_2', upper(fd.asegurado_colonia))
    setTextField(form, 'Municipio o Alcaldía_2', upper(fd.asegurado_municipio))
    setTextField(form, 'Entidad Federativa_2', upper(fd.asegurado_estado))
    setTextField(form, 'País_2', upper(fd.asegurado_pais || 'MEXICO'))
    setTextField(form, 'Correo electrónico_2', fd.asegurado_email)
    setTextField(form, 'Teléfono móvil_2', fd.asegurado_telefono)
    setTextField(form, 'Ocupación actual_2', upper(fd.asegurado_ocupacion))
    setTextField(form, 'Nacionalidad_2', upper(fd.asegurado_nacionalidad))
    setTextField(form, 'Entidad Federativa y País de nacimiento_2', upper(fd.asegurado_estado_nacimiento))
    setTextField(form, 'No de identifcación fiscal y País emisor solo extranjeros_2', upper(fd.asegurado_identificacion_fiscal_extranjero))
    setTextField(form, 'Tipo de identificación Solicitante', upper(fd.asegurado_tipo_id))
    setTextField(form, 'Entidad emisora Solicitante', upper(fd.asegurado_id_emisor))
    setTextField(form, 'Folio no de identificaión Solicitante', upper(fd.asegurado_num_id))
  }

  // Page 2 — Product / Plan / Cobro
  setCheckbox(form, 'Vida Más', true)
  setCheckbox(form, 'Vida Más Constante', false)
  setCheckbox(form, 'Integral', upper(fd.plan) === 'INTEGRAL')
  setCheckbox(form, 'SALUD', upper(fd.plan) === 'SALUD')
  setCheckbox(form, 'Salud', upper(fd.plan) === 'SALUD')
  setCheckbox(form, 'Esencial', upper(fd.plan) === 'ESENCIAL')
  setCheckbox(form, 'Accidentes', upper(fd.plan) === 'ACCIDENTES')
  setTextField(form, 'Suma Asegurada', fd.suma_asegurada)
  setTextField(form, 'Prima de seguro', fd.prima_base)
  setTextField(form, 'Prima excedente', fd.prima_adicional)
  const primaTotal = (Number(fd.prima_base || 0) + Number(fd.prima_adicional || 0)) || ''
  setTextField(form, 'Prima total', primaTotal)
  setTextField(form, ' Prima total', primaTotal)
  setCheckbox(form, 'Quincenal', upper(fd.periodicidad) === 'QUINCENAL')
  setCheckbox(form, 'Mensual', upper(fd.periodicidad) === 'MENSUAL')
  setCheckbox(form, 'Anual', upper(fd.periodicidad) === 'ANUAL')
  setCheckbox(form, 'Cargo a tarjeta de crédito', false)
  setCheckbox(form, 'Cargo a tarjeta de débito', false)
  setTextField(form, 'Cuenta CLABE', fd.clabe)
  setTextField(form, 'Banco', upper(fd.banco))
  setTextField(form, 'Fecha cobro', fechaCobro.dd)
  setBeneficiarioFields(form, fd.beneficiarios)

  form.flatten()
  return Buffer.from(await pdfDoc.save())
}

function rowToFormData(row: Record<string, unknown>, beneficiarios: Beneficiario[]): FormData {
  const misma = Boolean(row.misma_persona)
  return {
    clave_agente: text(row.clave_agente),
    nombre_agente: text(row.nombre_agente),
    folio: text(row.folio),
    semana_id: undefined,
    week_number: Number(row.week_number || 0) || undefined,
    year: Number(row.year || 0) || undefined,
    contratante_nombres: text(row.contratante_nombres),
    contratante_ap_paterno: text(row.contratante_ap_paterno),
    contratante_ap_materno: text(row.contratante_ap_materno),
    contratante_fecha_nac: text(row.contratante_fecha_nac),
    contratante_genero: text(row.contratante_genero),
    contratante_rfc: text(row.contratante_rfc),
    contratante_curp: text(row.contratante_curp),
    contratante_tipo_id: text(row.contratante_tipo_id || row.contratante_tipo_identificacion),
    contratante_num_id: text(row.contratante_num_id),
    contratante_email: text(row.contratante_email),
    contratante_telefono: text(row.contratante_telefono),
    contratante_calle: text(row.contratante_calle),
    contratante_num_ext: text(row.contratante_num_ext),
    contratante_num_int: text(row.contratante_num_int),
    contratante_cp: text(row.contratante_cp),
    contratante_colonia: text(row.contratante_colonia),
    contratante_estado: text(row.contratante_estado),
    contratante_municipio: text(row.contratante_municipio),
    contratante_ocupacion: text(row.contratante_ocupacion),
    contratante_dependencia: text(row.contratante_dependencia || row.dependencia),
    nexos_delincuencia: 'no',
    forma_cobro: ((row.forma_cobro as 'nomina' | 'clabe' | '') || ''),
    clave_delegacional: text(row.clave_delegacional),
    matricula: text(row.matricula),
    sub_dependencia: text(row.sub_dependencia),
    folio_contrato: text(row.folio_contrato),
    clabe: text(row.clabe),
    banco: text(row.banco),
    fecha_inicio_cobro: text(row.fecha_inicio_cobro),
    contratante_lugar_nacimiento: text(row.contratante_lugar_nacimiento),
    contratante_nacionalidad: text(row.contratante_nacionalidad),
    contratante_identificacion_fiscal_extranjero: text(row.contratante_identificacion_fiscal_extranjero),
    contratante_regimen_fiscal: text(row.contratante_regimen_fiscal),
    contratante_id_emisor: text(row.contratante_id_emisor || row.contratante_identificacion_emisor),
    contratante_pais: text(row.contratante_pais || 'MEXICO'),
    misma_persona: misma,
    asegurado_nombres: text(row.asegurado_nombres),
    asegurado_ap_paterno: text(row.asegurado_ap_paterno),
    asegurado_ap_materno: text(row.asegurado_ap_materno),
    asegurado_fecha_nac: text(row.asegurado_fecha_nac),
    asegurado_genero: text(row.asegurado_genero),
    asegurado_rfc: text(row.asegurado_rfc),
    asegurado_nacionalidad: text(row.asegurado_nacionalidad),
    asegurado_identificacion_fiscal_extranjero: text(row.asegurado_identificacion_fiscal_extranjero),
    asegurado_tipo_id: text(row.asegurado_tipo_id),
    asegurado_num_id: text(row.asegurado_num_id),
    asegurado_id_emisor: text(row.asegurado_id_emisor),
    asegurado_email: text(row.asegurado_email),
    asegurado_telefono: text(row.asegurado_telefono),
    asegurado_ocupacion: text(row.asegurado_ocupacion),
    asegurado_estado_nacimiento: text(row.asegurado_estado_nacimiento),
    asegurado_mismo_domicilio_contratante: Boolean(row.asegurado_mismo_domicilio_contratante ?? true),
    asegurado_calle: text(row.asegurado_calle),
    asegurado_num_ext: text(row.asegurado_num_ext),
    asegurado_num_int: text(row.asegurado_num_int),
    asegurado_cp: text(row.asegurado_cp),
    asegurado_colonia: text(row.asegurado_colonia),
    asegurado_estado: text(row.asegurado_estado),
    asegurado_municipio: text(row.asegurado_municipio),
    asegurado_pais: text(row.asegurado_pais || 'MEXICO'),
    asegurado_tiene_otras_polizas: 'No',
    plan: text(row.plan),
    periodicidad: text(row.periodicidad),
    prima_base: text(row.prima_base || row.prima_neta),
    prima_adicional: text(row.prima_adicional),
    suma_asegurada: text(row.suma_asegurada),
    base_calculo: text(row.base_calculo),
    beneficiarios,
    firma_base64: undefined,
  }
}

export async function generateAndStoreSolicitudPdf(solicitudId: string) {
  const supabase = createServerClient()
  const { data: solicitud, error } = await supabase
    .from('solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .single()

  if (error || !solicitud) throw new Error(error?.message || 'Solicitud no encontrada')

  const { data: beneficiariosRows } = await supabase
    .from('solicitud_beneficiarios')
    .select('nombres, ap_paterno, ap_materno, parentesco, porcentaje, fecha_nac')
    .eq('solicitud_id', solicitudId)
    .order('created_at', { ascending: true })

  const beneficiarios = (beneficiariosRows || []).map((b) => ({
    nombres: text(b.nombres),
    ap_paterno: text(b.ap_paterno),
    ap_materno: text(b.ap_materno),
    parentesco: text(b.parentesco),
    porcentaje: Number(b.porcentaje || 0),
    fecha_nac: text(b.fecha_nac),
  })) as Beneficiario[]

  const fd = rowToFormData(solicitud as unknown as Record<string, unknown>, beneficiarios)
  const pdfBuffer = await buildSolicitudPdf(fd)
  const storagePath = `generated/${fd.folio || solicitudId}.pdf`

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) throw new Error(uploadError.message)

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 30)

  if (signedUrlError) throw new Error(signedUrlError.message)

  const signedUrl = signedUrlData?.signedUrl || ''

  await supabase
    .from('solicitud_documentos')
    .upsert({
      solicitud_id: solicitudId,
      doc_type: GENERATED_DOC_TYPE,
      source: 'generated_pdf',
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
      public_url: signedUrl,
      mime_type: 'application/pdf',
      upload_state: 'uploaded',
      upload_at: new Date().toISOString(),
      ocr_state: 'skipped',
      backup_state: 'pending',
      is_latest: true,
      created_by: fd.clave_agente || 'pdf_generator',
    })

  return {
    solicitudId,
    folio: fd.folio,
    storagePath,
    signedUrl,
  }
}
