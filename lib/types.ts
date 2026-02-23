export interface Agente {
  id: number
  clave: string
  nombre_completo: string
  nombre_corto?: string
  status?: string
}

export interface Semana {
  id: number
  year: number
  week_number: number
  start_date: string
  end_date: string
}

export interface Beneficiario {
  id: string
  nombres: string
  ap_paterno: string
  ap_materno: string
  parentesco: string
  fecha_nac: string
  porcentaje: number
}

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

  // Step 6: Beneficiarios
  beneficiarios: Beneficiario[]

  // Step 7: Documents (stored as paths)
  docs_ine_frente?: string
  docs_ine_reverso?: string
  docs_talon?: string

  // Step 8: Firma
  firma_base64?: string
}

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
