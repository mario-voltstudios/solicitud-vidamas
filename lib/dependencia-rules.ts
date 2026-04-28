import type { FormData } from '@/lib/types'

export type DocType =
  | 'ine_frente'
  | 'ine_reverso'
  | 'talon'
  | 'carta_instruccion'
  | 'constancia_derechohabiente'
  | 'clave_unica_pago'
  | 'solicitud_p1'
  | 'solicitud_p2'
  | 'solicitud_p3'
  | 'solicitud_p4'
  | 'solicitud_p5'
  | 'solicitud_p6'
  | 'video'

export interface DocRequirement {
  key: DocType
  title: string
  description: string
  required: boolean
  category: 'identity' | 'payroll' | 'supporting' | 'signature' | 'verification'
  reason?: string
}

const SIGNATURE_DOCS: DocRequirement[] = [
  {
    key: 'solicitud_p1',
    title: 'Solicitud — Página 1',
    description: 'Primera página firmada de la solicitud',
    required: true,
    category: 'signature',
  },
  {
    key: 'solicitud_p2',
    title: 'Solicitud — Página 2',
    description: 'Segunda página firmada de la solicitud',
    required: true,
    category: 'signature',
  },
  {
    key: 'solicitud_p3',
    title: 'Solicitud — Página 3',
    description: 'Tercera página firmada de la solicitud',
    required: true,
    category: 'signature',
  },
]

const IDENTITY_DOCS: DocRequirement[] = [
  {
    key: 'ine_frente',
    title: 'INE — Frente',
    description: 'Foto clara del frente de la credencial',
    required: true,
    category: 'identity',
  },
  {
    key: 'ine_reverso',
    title: 'INE — Reverso',
    description: 'Foto clara del reverso de la credencial',
    required: true,
    category: 'identity',
  },
]

const VERIFICATION_DOCS: DocRequirement[] = [
  {
    key: 'video',
    title: 'Video de verificación',
    description: 'Video corto del cliente con la solicitud',
    required: false,
    category: 'verification',
    reason: 'Puede pedirse después si la operación lo requiere.',
  },
]

export function normalizeDependencia(value?: string | null) {
  const v = (value || '').trim().toUpperCase()
  if (!v) return 'SIN_DEPENDENCIA'
  if (v.includes('IMSS') && v.includes('JUB')) return 'IMSS_JUBILADOS'
  if (v.includes('IMSS')) return 'IMSS_ACTIVOS'
  if (v.includes('ISSSTE')) return 'ISSSTE'
  if (v.includes('SEP')) return 'SEP'
  if (v.includes('CDMX') || v.includes('CIUDAD DE MEXICO')) return 'GOB_CDMX'
  if (v.includes('GOB')) return 'GOBIERNO'
  return 'OTRA'
}

export function getDependenciaRequirements(formData: Pick<FormData, 'forma_cobro' | 'contratante_dependencia'>): DocRequirement[] {
  const formaCobro = formData.forma_cobro
  const dependencia = normalizeDependencia(formData.contratante_dependencia)

  const base: DocRequirement[] = [...IDENTITY_DOCS]

  if (formaCobro === 'nomina') {
    base.push({
      key: 'talon',
      title: 'Talón de pago más reciente',
      description: 'Sirve para detectar dependencia, matrícula y validaciones de nómina.',
      required: true,
      category: 'payroll',
    })
  }

  switch (dependencia) {
    case 'IMSS_ACTIVOS':
      base.push(...SIGNATURE_DOCS)
      break
    case 'IMSS_JUBILADOS':
      base.push(...SIGNATURE_DOCS)
      base.push({
        key: 'carta_instruccion',
        title: 'Carta de Instrucción',
        description: 'Requerida para IMSS jubilados.',
        required: true,
        category: 'supporting',
      })
      break
    case 'ISSSTE':
      base.push(...SIGNATURE_DOCS)
      base.push({
        key: 'constancia_derechohabiente',
        title: 'Constancia de derechohabiente',
        description: 'Soporte adicional para casos ISSSTE / sector público.',
        required: false,
        category: 'supporting',
        reason: 'Puede pedirse por excepción si el talón no trae suficiente detalle.',
      })
      break
    case 'SEP':
      base.push(...SIGNATURE_DOCS)
      base.push({
        key: 'clave_unica_pago',
        title: 'Clave Única de Pago',
        description: 'Soporte adicional frecuente para SEP.',
        required: false,
        category: 'supporting',
        reason: 'Puede completarse después si no está disponible al momento del envío.',
      })
      break
    case 'GOB_CDMX':
    case 'GOBIERNO':
      base.push(...SIGNATURE_DOCS)
      break
    default:
      base.push(...SIGNATURE_DOCS)
      break
  }

  return [...base, ...VERIFICATION_DOCS]
}

export function getUploadedDocs(formData: FormData): Partial<Record<DocType, string>> {
  return {
    ine_frente: formData.docs_ine_frente,
    ine_reverso: formData.docs_ine_reverso,
    talon: formData.docs_talon,
    carta_instruccion: formData.docs_carta_instruccion,
    constancia_derechohabiente: formData.docs_constancia_derechohabiente,
    clave_unica_pago: formData.docs_clave_unica_pago,
    solicitud_p1: formData.docs_solicitud_p1,
    solicitud_p2: formData.docs_solicitud_p2,
    solicitud_p3: formData.docs_solicitud_p3,
    solicitud_p4: formData.docs_solicitud_p4,
    solicitud_p5: formData.docs_solicitud_p5,
    solicitud_p6: formData.docs_solicitud_p6,
    video: formData.docs_video,
  }
}

export function getMissingRequiredDocs(formData: FormData): DocRequirement[] {
  const uploaded = getUploadedDocs(formData)
  return getDependenciaRequirements(formData).filter((doc) => doc.required && !uploaded[doc.key])
}

// ============================================================
// Intake V2 — Deterministic dependencia / contrato resolver
// ============================================================
// Pure rule engine. No DB reads, no external calls, no UI coupling.

export type PaymentMethod = 'nomina' | 'banco_quincenal' | 'clabe' | 'unknown'

export type ResolvedDependenciaKey =
  | 'IMSS_ACTIVOS'
  | 'IMSS_JUBILADOS'
  | 'IMSS_ESTATUTO_A'
  | 'SEP_CENTRAL'
  | 'SEP_MEDIA_SUPERIOR'
  | 'SEP_AFDSEDF'
  | 'ISSSTE'
  | 'GOB_CDMX'
  | 'UAQ'
  | 'BANCO_QUINCENAL'
  | 'UNKNOWN'

export interface DependenciaRuleInput {
  institucion?: string | null
  dependencia?: string | null
  forma_cobro?: PaymentMethod | FormData['forma_cobro'] | null
  tipo_contratacion?: string | number | null
  concepto_descuento?: string | number | null
  clave_presupuestal?: string | null
  centro_trabajo?: string | null
  clave_delegacional?: string | null
  matricula?: string | null
  numero_empleado?: string | number | null
  rfc?: string | null
  folio_fiscal?: string | null
  fecha_ingreso?: string | null
}

export interface DependenciaRuleOutput {
  key: ResolvedDependenciaKey
  dependencia: string
  subdependencia: string
  contrato: string
  concepto?: string
  folio: string
  tipo_cobro: 'DXN' | 'BANCO_CALENDARIZADO_QUINCENAL' | 'UNKNOWN'
  frecuencia: 'Quincenal' | 'Mensual' | 'Unknown'
  llave_descuento: {
    source: 'matricula' | 'numero_empleado' | 'rfc_13' | 'rfc_10' | 'none'
    value?: string
    required: boolean
  }
  required_documents: string[]
  manual_review_flags: string[]
  warnings: string[]
}

function cleanText(value?: string | number | null) {
  return String(value ?? '').trim()
}

function upperText(value?: string | number | null) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function normalizeTC(value?: string | number | null) {
  const digits = cleanText(value).replace(/\D/g, '')
  if (!digits) return ''
  return String(Number(digits)).padStart(digits.length >= 2 ? digits.length : 2, '0')
}

function normalizeConcept(value?: string | number | null) {
  return upperText(value).replace(/\s+/g, '')
}

function normalizeRFC(value?: string | null) {
  return upperText(value).replace(/[^A-Z0-9]/g, '')
}

function resolveBancoQuincenal(): DependenciaRuleOutput {
  return {
    key: 'BANCO_QUINCENAL',
    dependencia: 'BANCO CALENDARIZADO QUINCENAL',
    subdependencia: 'BANCO CALENDARIZADO QUINCENAL',
    contrato: '20200001 - BANCO CALENDARIZADO QUINCENAL',
    folio: 'N0078461',
    tipo_cobro: 'BANCO_CALENDARIZADO_QUINCENAL',
    frecuencia: 'Quincenal',
    llave_descuento: { source: 'none', required: false },
    required_documents: ['INE', 'Solicitud firmada', 'CLABE/cuenta bancaria'],
    manual_review_flags: [],
    warnings: [],
  }
}

function isBancoLike(input: DependenciaRuleInput) {
  const forma = upperText(input.forma_cobro)
  return forma === 'BANCO_QUINCENAL' || forma === 'CLABE' || forma.includes('BANCO')
}

function detectInstitution(input: DependenciaRuleInput) {
  return upperText(`${input.institucion ?? ''} ${input.dependencia ?? ''}`)
}

function resolveIMSS(input: DependenciaRuleInput): DependenciaRuleOutput | null {
  const tc = normalizeTC(input.tipo_contratacion)
  const concepto = normalizeConcept(input.concepto_descuento)
  const matricula = cleanText(input.matricula)

  if (['01', '02', '07', '09'].includes(tc) || concepto === '195') {
    return {
      key: 'IMSS_ACTIVOS',
      dependencia: '00332 - IMSS ACTIVOS',
      subdependencia: 'IMSS ACTIVOS',
      contrato: '15 - IMSS Activos',
      concepto: '195',
      folio: 'N0058293',
      tipo_cobro: 'DXN',
      frecuencia: 'Quincenal',
      llave_descuento: { source: 'matricula', value: matricula || undefined, required: true },
      required_documents: ['INE', 'Talón de descuento', 'Carta Instrucción', 'Solicitud firmada'],
      manual_review_flags: matricula ? [] : ['missing_matricula'],
      warnings: [],
    }
  }

  if (['10', '11'].includes(tc) || concepto === '395') {
    return {
      key: 'IMSS_JUBILADOS',
      dependencia: '00332 - IMSS ACTIVOS',
      subdependencia: 'IMSS ORIENTE',
      contrato: '16 - VIDA MAS IMSS Jubilados',
      concepto: '395',
      folio: 'N0063319',
      tipo_cobro: 'DXN',
      frecuencia: 'Mensual',
      llave_descuento: { source: 'matricula', value: matricula || undefined, required: true },
      required_documents: ['INE', 'Talón de descuento', 'Carta Instrucción', 'Solicitud firmada'],
      manual_review_flags: matricula ? [] : ['missing_matricula'],
      warnings: [],
    }
  }

  if (tc === '00' || tc === '0' || concepto === '995') {
    return {
      key: 'IMSS_ESTATUTO_A',
      dependencia: '00332 - IMSS ACTIVOS',
      subdependencia: 'IMSS ESTATUTO A',
      contrato: '17 - Vida Mas Estatuto A',
      concepto: '995',
      folio: 'N0058293',
      tipo_cobro: 'DXN',
      frecuencia: 'Quincenal',
      llave_descuento: { source: 'matricula', value: matricula || undefined, required: true },
      required_documents: ['INE', 'Talón de descuento', 'Carta Instrucción', 'Solicitud firmada'],
      manual_review_flags: matricula ? [] : ['missing_matricula'],
      warnings: [],
    }
  }

  return null
}

function resolveSEP(input: DependenciaRuleInput): DependenciaRuleOutput | null {
  const clave = cleanText(input.clave_presupuestal)
  if (clave && !clave.startsWith('11')) return null

  const centro = upperText(input.centro_trabajo)
  const rfc = normalizeRFC(input.rfc)
  const manual_review_flags = rfc.length === 13 ? [] : ['sep_rfc_13_required']

  if (centro.includes('MEDIA') || centro.includes('SUPERIOR') || centro.includes('DGET') || centro.includes('BACHILL')) {
    return {
      key: 'SEP_MEDIA_SUPERIOR',
      dependencia: '00105 - SECRETARIA DE EDUCACION PUBLICA',
      subdependencia: 'SEP MEDIA SUPERIOR',
      contrato: 'APF VIDA MÁS SEP MEDIA SUPERIOR NOMINA',
      concepto: 'G1',
      folio: 'N0064867',
      tipo_cobro: 'DXN',
      frecuencia: 'Quincenal',
      llave_descuento: { source: 'rfc_13', value: rfc || undefined, required: true },
      required_documents: ['INE', 'Talón de pago', 'Solicitud firmada'],
      manual_review_flags,
      warnings: [],
    }
  }

  if (centro.includes('AFDSEDF') || centro.includes('ADMINISTRACION FEDERAL') || centro.includes('SERVICIOS EDUCATIVOS')) {
    return {
      key: 'SEP_AFDSEDF',
      dependencia: '00105 - SECRETARIA DE EDUCACION PUBLICA',
      subdependencia: '00082 - ADMINISTRACION FEDERAL DE SERVICIOS EDUCATIVOS EN EL DISTRITO FEDERAL',
      contrato: 'APF VIDA MÁS ADMON. GRAL. SERV. EDU. DF.',
      concepto: 'G1',
      folio: 'N0064866',
      tipo_cobro: 'DXN',
      frecuencia: 'Quincenal',
      llave_descuento: { source: 'rfc_13', value: rfc || undefined, required: true },
      required_documents: ['INE', 'Talón de pago', 'Solicitud firmada'],
      manual_review_flags,
      warnings: [],
    }
  }

  return {
    key: 'SEP_CENTRAL',
    dependencia: '00105 - SECRETARIA DE EDUCACION PUBLICA',
    subdependencia: '00083 - SEP CENTRAL',
    contrato: 'APF VIDA MÁS SEP CENTRAL NOMINA',
    concepto: 'G1',
    folio: 'N0064865',
    tipo_cobro: 'DXN',
    frecuencia: 'Quincenal',
    llave_descuento: { source: 'rfc_13', value: rfc || undefined, required: true },
    required_documents: ['INE', 'Talón de pago', 'Solicitud firmada'],
    manual_review_flags,
    warnings: [],
  }
}

function resolveISSSTE(input: DependenciaRuleInput): DependenciaRuleOutput {
  const raw = cleanText(input.numero_empleado || input.matricula)
  const digits = raw.replace(/\D/g, '')
  const value = digits ? digits.padStart(6, '0').slice(-6) : undefined
  const manual_review_flags = digits.length > 0 && digits.length <= 6 ? [] : ['issste_employee_number_6_digits_required']

  return {
    key: 'ISSSTE',
    dependencia: '00180 - ISSSTE',
    subdependencia: '00133 - INSTITUTO DE SEGURIDAD Y SERVICIOS SOCIALES',
    contrato: '2 - ISSSTE0093793001',
    concepto: '83',
    folio: 'N0051765',
    tipo_cobro: 'DXN',
    frecuencia: 'Quincenal',
    llave_descuento: { source: 'numero_empleado', value, required: true },
    required_documents: ['INE vigente', 'Talón de autorización de descuento', 'Recibo de nómina', 'Solicitud firmada'],
    manual_review_flags,
    warnings: ['ISSSTE only accepts INE as identification for DxN'],
  }
}

function resolveGobCDMX(input: DependenciaRuleInput): DependenciaRuleOutput {
  const numeroEmpleado = cleanText(input.numero_empleado || input.matricula)
  const flags = ['requires_formato_de_reserva', 'manual_review_required']
  if (!numeroEmpleado) flags.push('missing_numero_empleado')
  if (!cleanText(input.folio_fiscal)) flags.push('folio_fiscal_required_for_reserva')

  return {
    key: 'GOB_CDMX',
    dependencia: '00390 - GOBIERNO DE LA CIUDAD DE MEXICO',
    subdependencia: '00412 - GOBIERNO DE LA CIUDAD DE MEXICO',
    contrato: '240 - GOB CDMX',
    concepto: 'GNP-SEG',
    folio: 'N0073208',
    tipo_cobro: 'DXN',
    frecuencia: 'Quincenal',
    llave_descuento: { source: 'numero_empleado', value: numeroEmpleado || undefined, required: true },
    required_documents: ['INE', '2 talones recientes', 'Formato de Reserva', 'Consentimiento de Descuento', 'Solicitud firmada'],
    manual_review_flags: flags,
    warnings: ['Validate 30% máximo del líquido a cobrar before emission'],
  }
}

function resolveUAQ(input: DependenciaRuleInput): DependenciaRuleOutput {
  const rfc = normalizeRFC(input.rfc)
  const rfc10 = rfc.slice(0, 10) || undefined
  const flags = ['requires_special_consentimiento']
  if (rfc.length < 10) flags.push('uaq_rfc_10_required')
  if (!cleanText(input.fecha_ingreso)) flags.push('fecha_ingreso_required_to_rule_out_eventual')

  return {
    key: 'UAQ',
    dependencia: '0167 - UNIVERSIDAD AUTÓNOMA DE QUERÉTARO',
    subdependencia: '00201 - UNIVERSIDAD AUTÓNOMA DE QUERÉTARO',
    contrato: '23 - UAQ NOMINA',
    concepto: '341',
    folio: 'N0091588',
    tipo_cobro: 'DXN',
    frecuencia: 'Quincenal',
    llave_descuento: { source: 'rfc_10', value: rfc10, required: true },
    required_documents: ['INE', 'Recibo de nómina', 'Consentimiento de Descuento especial', 'Solicitud firmada'],
    manual_review_flags: flags,
    warnings: [],
  }
}

export function resolveDependenciaRule(input: DependenciaRuleInput): DependenciaRuleOutput {
  if (isBancoLike(input)) return resolveBancoQuincenal()

  const institution = detectInstitution(input)
  const concept = normalizeConcept(input.concepto_descuento)

  if (institution.includes('IMSS') || institution.includes('INSTITUTO MEXICANO DEL SEGURO SOCIAL') || ['195', '395', '995'].includes(concept)) {
    const imss = resolveIMSS(input)
    if (imss) return imss
  }

  if (institution.includes('SEP') || institution.includes('SECRETARIA DE EDUCACION')) {
    const sep = resolveSEP(input)
    if (sep) return sep
  }

  if (institution.includes('ISSSTE') || institution.includes('SEGURIDAD Y SERVICIOS SOCIALES')) {
    return resolveISSSTE(input)
  }

  if (institution.includes('CDMX') || institution.includes('CIUDAD DE MEXICO') || concept === 'GNP-SEG') {
    return resolveGobCDMX(input)
  }

  if (institution.includes('UAQ') || institution.includes('UNIVERSIDAD AUTONOMA DE QUERETARO') || concept === '341') {
    return resolveUAQ(input)
  }

  return {
    key: 'UNKNOWN',
    dependencia: 'UNKNOWN',
    subdependencia: 'UNKNOWN',
    contrato: 'UNKNOWN',
    folio: '',
    tipo_cobro: 'UNKNOWN',
    frecuencia: 'Unknown',
    llave_descuento: { source: 'none', required: false },
    required_documents: ['INE', 'Solicitud firmada'],
    manual_review_flags: ['unknown_dependencia_manual_review'],
    warnings: ['Dependencia not recognized; escalate before emission'],
  }
}

