import { FormData, INITIAL_FORM_DATA, Beneficiario } from '@/lib/types'

/** Build a complete valid FormData for nomina/IMSS scenario */
export function makeBaseFormNomina(overrides: Partial<FormData> = {}): FormData {
  return {
    ...INITIAL_FORM_DATA,
    clave_agente: 'A001',
    nombre_agente: 'Juan Pérez',
    folio: 'A001-2026-S10-01',
    contratante_nombres: 'MARIA',
    contratante_ap_paterno: 'GARCIA',
    contratante_ap_materno: 'LOPEZ',
    contratante_fecha_nac: '1980-05-15',
    contratante_genero: 'F',
    contratante_rfc: 'GALM800515ABC',
    contratante_curp: 'GALM800515MDFRCR09',
    contratante_tipo_id: 'INE',
    contratante_num_id: '1234567890',
    contratante_email: 'maria@example.com',
    contratante_telefono: '5551234567',
    contratante_calle: 'Av. Reforma',
    contratante_num_ext: '100',
    contratante_num_int: '',
    contratante_cp: '06600',
    contratante_colonia: 'Juárez',
    contratante_estado: 'Ciudad de México',
    contratante_municipio: 'Cuauhtémoc',
    contratante_ocupacion: 'Empleado Federal',
    contratante_dependencia: 'IMSS',
    nexos_delincuencia: 'no',
    forma_cobro: 'nomina',
    matricula: 'M123456',
    clave_delegacional: '',
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
    plan: 'Integral',
    periodicidad: 'quincenal',
    prima_base: '500.00',
    prima_adicional: '',
    suma_asegurada: '200000',
    base_calculo: 'prima',
    beneficiarios: [
      {
        id: 'b1',
        nombres: 'CARLOS',
        ap_paterno: 'GARCIA',
        ap_materno: 'LOPEZ',
        parentesco: 'Hijo(a)',
        fecha_nac: '2010-03-10',
        porcentaje: 100,
      },
    ],
    docs_ine_frente: 'storage/ine-frente.jpg',
    docs_ine_reverso: 'storage/ine-reverso.jpg',
    docs_talon: 'storage/talon.pdf',
    docs_solicitud_p1: 'storage/p1.pdf',
    docs_solicitud_p2: 'storage/p2.pdf',
    docs_solicitud_p3: 'storage/p3.pdf',
    ...overrides,
  }
}

/** Build a valid CLABE payment form */
export function makeBaseFormCLABE(overrides: Partial<FormData> = {}): FormData {
  const base = makeBaseFormNomina({
    forma_cobro: 'clabe',
    contratante_dependencia: '',
    matricula: '',
    clabe: '012345678901234567',
    banco: 'BBVA Bancomer',
    fecha_inicio_cobro: '2026-04-01',
  })
  return { ...base, ...overrides }
}

export function makeBeneficiario(overrides: Partial<Beneficiario> = {}): Beneficiario {
  return {
    id: Math.random().toString(36).slice(2),
    nombres: 'TEST',
    ap_paterno: 'APELLIDO',
    ap_materno: 'SEGUNDO',
    parentesco: 'Hijo(a)',
    fecha_nac: '2000-01-01',
    porcentaje: 100,
    ...overrides,
  }
}
