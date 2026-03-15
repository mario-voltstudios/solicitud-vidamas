// ============================================================
// VidaMás Domain Model — Canonical Types
// ============================================================
//
// Each VidaMás solicitud / policy has 3 essential entities:
//   1. Contratante  — the payer (exactly 1)
//   2. Asegurado    — the insured/applicant (exactly 1)
//   3. Beneficiarios — death beneficiaries (1 or more, sum = 100%)
//
// The Contratante and Asegurado are often the same person
// (misma_persona = true), but they are always distinct roles.
//
// Solicitud is the intake source-of-truth.
// Póliza is created FROM the solicitud by the emisor.
// After emission, the póliza must be cross-checked against the
// solicitud role-by-role (see DOMAIN_MODEL.md for full spec).
// ============================================================

// ----------------------------------------------------------
// Sub-entity: Contratante (payer)
// ----------------------------------------------------------
export interface Contratante {
  nombres: string
  ap_paterno: string
  ap_materno: string
  fecha_nac: string
  genero: string
  rfc: string
  curp: string
  tipo_id: string
  num_id: string
  email: string
  telefono: string
  calle: string
  num_ext: string
  num_int: string
  cp: string
  colonia: string
  estado: string
  municipio: string
  ocupacion: string
  dependencia: string
}

// ----------------------------------------------------------
// Sub-entity: Asegurado (insured applicant)
// ----------------------------------------------------------
export interface Asegurado {
  nombres: string
  ap_paterno: string
  ap_materno: string
  fecha_nac: string
  genero: string
  rfc: string
  // Note: when misma_persona=true, asegurado fields mirror contratante
  misma_persona: boolean
}

// ----------------------------------------------------------
// Sub-entity: Cobro (payment/payroll info)
// ----------------------------------------------------------
export interface CobroInfo {
  forma_cobro: 'nomina' | 'clabe' | ''
  clave_delegacional: string
  matricula: string
  sub_dependencia: string
  folio_contrato: string
  clabe: string
  banco: string
  fecha_inicio_cobro: string
}

// ----------------------------------------------------------
// Sub-entity: Beneficiario (death beneficiary)
// ----------------------------------------------------------
export interface Beneficiario {
  id: string
  nombres: string
  ap_paterno: string
  ap_materno: string
  parentesco: string
  fecha_nac: string
  porcentaje: number
}

// ----------------------------------------------------------
// Sub-entity: PlanInfo
// ----------------------------------------------------------
export interface PlanInfo {
  plan: string
  periodicidad: string
  prima_base: string
  prima_adicional: string
  suma_asegurada: string
  base_calculo: string
}

// ----------------------------------------------------------
// Root form type — preserves all flat fields for the form
// wizard while making each entity explicitly nameable
// ----------------------------------------------------------
export interface FormData {
  // Step 1: Agente
  clave_agente: string
  nombre_agente: string
  folio: string
  semana_id?: number
  week_number?: number
  year?: number

  // Step 2: Contratante
  contratante_nombres: string
  contratante_ap_paterno: string
  contratante_ap_materno: string
  contratante_fecha_nac: string
  contratante_genero: string
  contratante_rfc: string
  contratante_curp: string
  contratante_tipo_id: string
  contratante_num_id: string
  contratante_email: string
  contratante_telefono: string
  contratante_calle: string
  contratante_num_ext: string
  contratante_num_int: string
  contratante_cp: string
  contratante_colonia: string
  contratante_estado: string
  contratante_municipio: string
  contratante_ocupacion: string
  contratante_dependencia: string
  nexos_delincuencia: 'no' | 'si' | ''

  // Step 3: Cobro
  forma_cobro: 'nomina' | 'clabe' | ''
  clave_delegacional: string
  matricula: string
  sub_dependencia: string
  folio_contrato: string
  clabe: string
  banco: string
  fecha_inicio_cobro: string

  // Step 4: Asegurado
  misma_persona: boolean
  asegurado_nombres: string
  asegurado_ap_paterno: string
  asegurado_ap_materno: string
  asegurado_fecha_nac: string
  asegurado_genero: string
  asegurado_rfc: string

  // Step 5: Plan
  plan: string
  periodicidad: string
  prima_base: string
  prima_adicional: string
  suma_asegurada: string
  base_calculo: string

  // Step 6: Beneficiarios (1+, sum must equal 100)
  beneficiarios: Beneficiario[]

  // Step 7: Documents (stored as paths/URLs)
  docs_ine_frente?: string
  docs_ine_reverso?: string
  docs_talon?: string
  docs_carta_instruccion?: string
  docs_constancia_derechohabiente?: string
  docs_clave_unica_pago?: string
  docs_solicitud_p1?: string
  docs_solicitud_p2?: string
  docs_solicitud_p3?: string
  docs_solicitud_p4?: string
  docs_solicitud_p5?: string
  docs_solicitud_p6?: string
  docs_video?: string

  // Step 8: Firma
  firma_base64?: string
}

// ----------------------------------------------------------
// Entity extractors
// Convenience helpers to extract typed sub-entities from
// the flat FormData without duplicating any logic.
// ----------------------------------------------------------

/** Extract the Contratante entity from a flat FormData */
export function extractContratante(fd: FormData): Contratante {
  return {
    nombres: fd.contratante_nombres,
    ap_paterno: fd.contratante_ap_paterno,
    ap_materno: fd.contratante_ap_materno,
    fecha_nac: fd.contratante_fecha_nac,
    genero: fd.contratante_genero,
    rfc: fd.contratante_rfc,
    curp: fd.contratante_curp,
    tipo_id: fd.contratante_tipo_id,
    num_id: fd.contratante_num_id,
    email: fd.contratante_email,
    telefono: fd.contratante_telefono,
    calle: fd.contratante_calle,
    num_ext: fd.contratante_num_ext,
    num_int: fd.contratante_num_int,
    cp: fd.contratante_cp,
    colonia: fd.contratante_colonia,
    estado: fd.contratante_estado,
    municipio: fd.contratante_municipio,
    ocupacion: fd.contratante_ocupacion,
    dependencia: fd.contratante_dependencia,
  }
}

/** Extract the Asegurado entity from a flat FormData.
 *  When misma_persona=true the name/DOB/gender/RFC fields
 *  are derived from the contratante fields. */
export function extractAsegurado(fd: FormData): Asegurado {
  if (fd.misma_persona) {
    return {
      nombres: fd.contratante_nombres,
      ap_paterno: fd.contratante_ap_paterno,
      ap_materno: fd.contratante_ap_materno,
      fecha_nac: fd.contratante_fecha_nac,
      genero: fd.contratante_genero,
      rfc: fd.contratante_rfc,
      misma_persona: true,
    }
  }
  return {
    nombres: fd.asegurado_nombres,
    ap_paterno: fd.asegurado_ap_paterno,
    ap_materno: fd.asegurado_ap_materno,
    fecha_nac: fd.asegurado_fecha_nac,
    genero: fd.asegurado_genero,
    rfc: fd.asegurado_rfc,
    misma_persona: false,
  }
}

/** Extract CobroInfo from a flat FormData */
export function extractCobroInfo(fd: FormData): CobroInfo {
  return {
    forma_cobro: fd.forma_cobro,
    clave_delegacional: fd.clave_delegacional,
    matricula: fd.matricula,
    sub_dependencia: fd.sub_dependencia,
    folio_contrato: fd.folio_contrato,
    clabe: fd.clabe,
    banco: fd.banco,
    fecha_inicio_cobro: fd.fecha_inicio_cobro,
  }
}

/** Extract PlanInfo from a flat FormData */
export function extractPlanInfo(fd: FormData): PlanInfo {
  return {
    plan: fd.plan,
    periodicidad: fd.periodicidad,
    prima_base: fd.prima_base,
    prima_adicional: fd.prima_adicional,
    suma_asegurada: fd.suma_asegurada,
    base_calculo: fd.base_calculo,
  }
}

// ----------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/** Validate beneficiario list:
 *  - At least 1 beneficiario required
 *  - Each porcentaje must be > 0
 *  - Sum of porcentajes must equal 100
 */
export function validateBeneficiarios(beneficiarios: Beneficiario[]): ValidationResult {
  const errors: string[] = []

  if (!beneficiarios || beneficiarios.length === 0) {
    errors.push('Se requiere al menos un beneficiario.')
    return { valid: false, errors }
  }

  beneficiarios.forEach((b, i) => {
    const label = `Beneficiario ${i + 1}`
    if (!b.nombres?.trim()) errors.push(`${label}: falta nombre.`)
    if (!b.ap_paterno?.trim()) errors.push(`${label}: falta apellido paterno.`)
    if (!b.parentesco?.trim()) errors.push(`${label}: falta parentesco.`)
    if (!b.fecha_nac?.trim()) errors.push(`${label}: falta fecha de nacimiento.`)
    if (typeof b.porcentaje !== 'number' || b.porcentaje <= 0) {
      errors.push(`${label}: porcentaje debe ser mayor que 0.`)
    }
  })

  const total = beneficiarios.reduce((sum, b) => sum + (b.porcentaje || 0), 0)
  // Allow tiny float drift
  if (Math.abs(total - 100) > 0.01) {
    errors.push(`La suma de porcentajes es ${total}% — debe ser exactamente 100%.`)
  }

  return { valid: errors.length === 0, errors }
}

/** Validate that contratante required fields are present */
export function validateContratante(fd: FormData): ValidationResult {
  const errors: string[] = []
  const required: (keyof FormData)[] = [
    'contratante_nombres',
    'contratante_ap_paterno',
    'contratante_ap_materno',
    'contratante_fecha_nac',
    'contratante_genero',
    'contratante_rfc',
    'contratante_curp',
    'contratante_email',
    'contratante_telefono',
    'contratante_dependencia',
  ]
  for (const field of required) {
    const val = fd[field]
    if (!val || String(val).trim() === '') {
      errors.push(`Contratante: campo requerido faltante — ${field.replace('contratante_', '')}.`)
    }
  }
  return { valid: errors.length === 0, errors }
}

/** Validate that asegurado required fields are present.
 *  When misma_persona=true, the contratante fields cover the asegurado. */
export function validateAsegurado(fd: FormData): ValidationResult {
  if (fd.misma_persona) return { valid: true, errors: [] }
  const errors: string[] = []
  const required: (keyof FormData)[] = [
    'asegurado_nombres',
    'asegurado_ap_paterno',
    'asegurado_ap_materno',
    'asegurado_fecha_nac',
    'asegurado_genero',
    'asegurado_rfc',
  ]
  for (const field of required) {
    const val = fd[field]
    if (!val || String(val).trim() === '') {
      errors.push(`Asegurado: campo requerido faltante — ${field.replace('asegurado_', '')}.`)
    }
  }
  return { valid: errors.length === 0, errors }
}

/** Full entity-presence validation for a complete solicitud.
 *  Returns aggregated errors for all three required entities. */
export function validateSolicitudEntities(fd: FormData): ValidationResult {
  const allErrors: string[] = []
  const c = validateContratante(fd)
  const a = validateAsegurado(fd)
  const b = validateBeneficiarios(fd.beneficiarios)
  allErrors.push(...c.errors, ...a.errors, ...b.errors)
  return { valid: allErrors.length === 0, errors: allErrors }
}

// ----------------------------------------------------------
// Constants
// ----------------------------------------------------------

export const INITIAL_FORM_DATA: FormData = {
  clave_agente: '',
  nombre_agente: '',
  folio: '',
  contratante_nombres: '',
  contratante_ap_paterno: '',
  contratante_ap_materno: '',
  contratante_fecha_nac: '',
  contratante_genero: '',
  contratante_rfc: '',
  contratante_curp: '',
  contratante_tipo_id: 'INE',
  contratante_num_id: '',
  contratante_email: '',
  contratante_telefono: '',
  contratante_calle: '',
  contratante_num_ext: '',
  contratante_num_int: '',
  contratante_cp: '',
  contratante_colonia: '',
  contratante_estado: '',
  contratante_municipio: '',
  contratante_ocupacion: '',
  contratante_dependencia: '',
  nexos_delincuencia: 'no',
  forma_cobro: '',
  clave_delegacional: '',
  matricula: '',
  sub_dependencia: '',
  folio_contrato: '',
  clabe: '',
  banco: '',
  fecha_inicio_cobro: '',
  misma_persona: true,
  asegurado_nombres: '',
  asegurado_ap_paterno: '',
  asegurado_ap_materno: '',
  asegurado_fecha_nac: '',
  asegurado_genero: '',
  asegurado_rfc: '',
  plan: '',
  periodicidad: '',
  prima_base: '',
  prima_adicional: '',
  suma_asegurada: '',
  base_calculo: 'prima',
  beneficiarios: [],
}

export const PARENTESCOS = [
  'Cónyuge',
  'Hijo(a)',
  'Padre',
  'Madre',
  'Hermano(a)',
  'Abuelo(a)',
  'Nieto(a)',
  'Tío(a)',
  'Sobrino(a)',
  'Otro',
]

export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche',
  'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima',
  'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo',
  'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca',
  'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
  'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán',
  'Zacatecas',
]

export const DEPENDENCIAS = [
  'IMSS', 'ISSSTE', 'SEP', 'Gobierno CDMX', 'Gobierno Estado',
  'CFE', 'PEMEX', 'Secretaría de Salud', 'Ejército/SEDENA',
  'Marina/SEMAR', 'PGR/FGR', 'Otra',
]
