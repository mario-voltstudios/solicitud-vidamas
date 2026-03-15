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
