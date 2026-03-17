// ============================================================
// VidaMás — Dropdown Constants
// Auto-generated from Paperform API (form xqui5ohw) + manual review
// Source: Paperform fields extraction 2026-03-16
// ============================================================

// Agent license
export const CEDULA_VIGENTE_OPTIONS = ['Si', 'No'] as const

// Sale geography — estados where Prospera/VeSeguro operates
// Paperform uses this order: primary markets first, then separator, then rest
export const ESTADOS_VENTA = [
  'Ciudad de México',
  'Estado de México',
  'Morelos',
  'Querétaro',
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Chiapas',
  'Chihuahua',
  'Coahuila',
  'Colima',
  'Durango',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'Michoacán',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas',
] as const

// All 32 estados for address fields
export const ESTADOS_MX = [
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Chiapas',
  'Chihuahua',
  'Ciudad de México',
  'Coahuila',
  'Colima',
  'Durango',
  'Estado de México',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'Michoacán',
  'Morelos',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Querétaro',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas',
] as const

// Sale municipality — Paperform field 6qjgc (sales location)
// CDMX alcaldías
export const ALCALDIAS_CDMX = [
  'Álvaro Obregón',
  'Azcapotzalco',
  'Benito Juárez',
  'Coyoacán',
  'Cuajimalpa de Morelos',
  'Cuauhtémoc',
  'Gustavo A. Madero',
  'Iztacalco',
  'Iztapalapa',
  'La Magdalena Contreras',
  'Miguel Hidalgo',
  'Milpa Alta',
  'Tláhuac',
  'Tlalpan',
  'Venustiano Carranza',
  'Xochimilco',
] as const

// Municipios EdoMex (primary operations)
export const MUNICIPIOS_EDOMEX_PRIMARY = [
  'Acolman',
  'Almoloya de Juárez',
  'Atizapán de Zaragoza',
  'Atlacomulco',
  'Chalco',
  'Chicoloapan',
  'Chimalhuacán',
  'Coacalco de Berriozábal',
  'Cuautitlán',
  'Cuautitlán Izcalli',
  'Ecatepec de Morelos',
  'Huehuetoca',
  'Huixquilucan',
  'Ixtapaluca',
  'Ixtlahuaca',
  'La Paz',
  'Lerma',
  'Metepec',
  'Naucalpan de Juárez',
  'Nezahualcóyotl',
  'Nicolás Romero',
  'San Felipe del Progreso',
  'Tecámac',
  'Temoaya',
  'Tenancingo',
  'Tepotzotlán',
  'Texcoco',
  'Tlalnepantla de Baz',
  'Toluca',
  'Tultepec',
  'Tultitlán',
  'Valle de Chalco Solidaridad',
  'Villa Victoria',
  'Zinacantepec',
  'Zumpango',
] as const

// Gender options
export const GENERO_OPTIONS = ['Masculino', 'Femenino'] as const

// Tax regime (Régimen fiscal for invoice)
export const REGIMEN_FISCAL_OPTIONS = [
  '605 SUELDOS Y SALARIOS E INGRESOS ASIMILADOS A SALARIOS',
  '606 ARRENDAMIENTO',
  '611 INGRESOS POR DIVIDENDOS (SOCIOS Y ACCIONISTAS)',
  '612 PERSONA FISICA CON ACTIVIDAD EMPRESARIAL',
  '621 INCORPORACION FISCAL',
  '622 ACTIVIDADES AGRICOLAS, GANADERAS, SILVICOLAS Y PESQUERAS',
  '625 REGIMEN DE LAS ACTIVIDADES EMPRESARIALES CON INGRESOS A TRAVES DE PLATAFORMAS TECNOLOGICAS',
  '626 REGIMEN SIMPLIFICADO DE CONFIANZA',
] as const

// ID types (contratante and asegurado share the same list)
export const TIPO_IDENTIFICACION_OPTIONS = [
  'INE',
  'IFE',
  'CEDULA PROFESIONAL',
  'PASAPORTE',
  'LICENCIA',
  'CREDENCIAL DEL TRABAJADOR',
] as const

// Occupation (contratante and asegurado share the same list)
// "NO ASEGURABLE" items are shown but trigger a warning
export const OCUPACION_OPTIONS = [
  // Standard occupations
  'Empleado',
  'Maestro o Docente',
  'Administrativo',
  'Almacen',
  'Doctor',
  'Enfermera',
  'Personal de apoyo medico',
  'Chofer',
  'Cobrador',
  'Colocación y/o mantenimiento de anuncios',
  'Electricista',
  'Inmersiones submarina (hasta 40 metros)',
  'Instalación y/o mantenimiento de antenas',
  'Limpiador de cristales y/o chimenea',
  'Mensajero en motocicleta',
  'Mineros (Sin manejo de explosivos y hasta 2 días a la semana en mina)',
  'Químico Radiología',
  'Reparador/Instalador de elevadores',
  'Policías',
  'Aviación (empleado en talleres y pilotos)',
  'Barquero (embarcación en aguas tranquilas o poco profundas)',
  'Cargador',
  'Chef o Cocinero',
  'Mudanzas',
  'Venta o instalación de aire Acondicionado',
  // Non-insurable occupations (shown with warning in UI)
  'Azafata (NO ASEGURABLE)',
  'Bombero (NO ASEGURABLE)',
  'Calderero (Refinería de petróleo) (NO ASEGURABLE)',
  'Carcelero (NO ASEGURABLE)',
  'Chofer (Vehículos blindados. Traslado de valores) (NO ASEGURABLE)',
  'Diputado (NO ASEGURABLE)',
  'Gobernador (NO ASEGURABLE)',
  'Guardaespaldas (NO ASEGURABLE)',
  'Guardia forestal (NO ASEGURABLE)',
  'Inmersiones submarina (más de 40 metros) (NO ASEGURABLE)',
  'Magistrados /Juez (Federales) (NO ASEGURABLE)',
  'Manejo o contacto con explosivos (NO ASEGURABLE)',
  'Marina (navegación) (NO ASEGURABLE)',
  'Militar (NO ASEGURABLE)',
  'Mineros (Manejo de explosivos y/o mayor o igual a 3 días a la semana en mina) (NO ASEGURABLE)',
  'Ministerio público (Locales) (NO ASEGURABLE)',
] as const

export const OCUPACIONES_NO_ASEGURABLES = OCUPACION_OPTIONS.filter(o =>
  o.includes('NO ASEGURABLE')
)

// Dependencias (employers/institutions covered by Prospera)
export const DEPENDENCIA_OPTIONS = [
  'SEP',
  'ISSSTE JUBILADOS',
  'ISSSTE',
  'ISSEMYM',
  'IMSS JUBILADOS',
  'IMSS',
  'GOBIERNO DEL ESTADO DE MEXICO',
  'GOB CDMX',
  'EMPRESA PRIVADA',
  'DIF MUNICIPAL TOLUCA',
  'UAQ',
  'GUARDIA NACIONAL Y SERVIDOR PUBLICO ARMADO',
  'OTRA DEPENDENCIA SERVIDOR PUBLICO',
] as const

export type Dependencia = typeof DEPENDENCIA_OPTIONS[number]

// Payment collection method
export const FORMA_COBRO_OPTIONS = [
  'Descuento por Nomina',
  'Tarjeta de Credito',
  'Tarjeta de Debito',
  'Cuenta CLABE (OJO en esta modalidad no hay mas de 3 reintentos)',
] as const

// IMSS delegational keys (Paperform field dn13i)
// These map to the 5 IMSS delegations Prospera operates in
export const IMSS_CLAVE_DELEGACIONAL_OPTIONS = [
  '15', // Estado de México Poniente
  '16', // Estado de México Oriente
  '18', // Morelos
  '23', // Querétaro
  '39', // CDMX Sur
] as const

// Contract types (Tipo de Contrato — used for IMSS payroll coding)
export const TIPO_CONTRATO_OPTIONS = [
  '00',
  '01',
  '02',
  '04',
  '07',
  '08',
  '09',
  '10',
  '11',
] as const

// IMSS location/unit names (Nombre de la Ubicacion — Paperform field 7i4u9)
// This is the complete list from the IMSS payroll system
export const UBICACION_NOMBRE_OPTIONS = [
  'VELATORIO 01',
  'UMF C/HOSP 06',
  'UMF 97', 'UMF 96', 'UMF 95', 'UMF 93', 'UMF 92', 'UMF 91',
  'UMF 89', 'UMF 88', 'UMF 87', 'UMF 86', 'UMF 85', 'UMF 84',
  'UMF 83', 'UMF 82', 'UMF 81', 'UMF 80', 'UMF 79', 'UMF 78',
  'UMF 77', 'UMF 75', 'UMF 74', 'UMF 73', 'UMF 70', 'UMF 69',
  'UMF 68', 'UMF 67', 'UMF 66', 'UMF 65', 'UMF 64', 'UMF 63',
  'UMF 62', 'UMF 61', 'UMF 59', 'UMF 58', 'UMF 56', 'UMF 55',
  'UMF 54', 'UMF 52', 'UMF 51', 'UMF 44', 'UMF 43', 'UMF 42',
  'UMF 41', 'UMF 40', 'UMF 39', 'UMF 38', 'UMF 37', 'UMF 36',
  'UMF 35', 'UMF 34', 'UMF 33', 'UMF 32', 'UMF 250', 'UMF 249',
  'UMF 248', 'UMF 247', 'UMF 246', 'UMF 198', 'UMF 195', 'UMF 193',
  'UMF 192', 'UMF 191', 'UMF 190', 'UMF 189', 'UMF 188', 'UMF 187',
  'UMF 186', 'UMF 185', 'UMF 184', 'UMF 183', 'UMF 182', 'UMF 181',
  'UMF 180', 'UMF 12', 'UMF 11', 'UMF 10', 'UMF 09', 'UMF 08',
  'UMF 07', 'UMF 05', 'UMF 04', 'UMF 03', 'UMF 02', 'UMF 01',
  'UMAA 01',
  'U DEPORT 01',
  'TIENDA EMPLEADOS IMSS 03',
  'TIENDA EMPLEADOS IMSS 02 ECATEPEC',
  'TIENDA EMPLEADOS IMSS 01',
  'TEATRO 02', 'TEATRO 01',
  'TALLER PROTESIS Y ORTESIS',
  'SUBDELEG 03 LOS REYES LA PASA',
  'SUBDELEG 02 ECATEPEC',
  'SUBDELEG 02', 'SUBDELEG 01',
  'Sin información',
  'RESID CONSER PERIF 27', 'RESID CONSER PERIF 26', 'RESID CONSER PERIF 25',
  'RESID CONSER PERIF 24', 'RESID CONSER PERIF 20', 'RESID CONSER PERIF 19',
  'RESID CONSER PERIF 15', 'RESID CONSER PERIF 14', 'RESID CONSER PERIF 10',
  'RESID CONSER PERIF 03', 'RESID CONSER PERIF 02', 'RESID CONSER PERIF 01',
  'PLANTA LAVADO 01',
  'OFNA AUX NIVEL D 14', 'OFNA AUX NIVEL D 11', 'OFNA AUX NIVEL D 10',
  'OFNA AUX NIVEL D 09', 'OFNA AUX NIVEL D 08', 'OFNA AUX NIVEL D 05',
  'OFNA AUX NIVEL D 04', 'OFNA AUX NIVEL D 03', 'OFNA AUX NIVEL D 02',
  'OFNA AUX NIVEL D 01',
  'OFNA ALTERNA DELEG',
  'HOSPITAL 68',
  'HOSPITAL 53 LOS REYES LA PAZ',
  'HOSPITAL 197 Texcoco',
  'HOSP TRAUMA Y ORTOPEDIA 01',
  'HOSP GRAL Z C/MF 76', 'HOSP GRAL Z C/MF 71',
  'HOSP GRAL Z 98', 'HOSP GRAL Z 58', 'HOSP GRAL Z 57',
  'HOSP GRAL Z 194',
  'HOSP GRAL REG 72', 'HOSP GRAL REG 200', 'HOSP GRAL REG 196', 'HOSP GRAL REG 08',
  'HOSP GINECO OBSTETRICIA C/MF 60',
  'HOSP GINECO OBSTETRCIA 221',
  'GUARD HIJOS MADRES EMPLEADAS IMSS 01',
  'GUARD HIJOS MADRES ASEG 47', 'GUARD HIJOS MADRES ASEG 45',
  'GUARD HIJOS MADRES ASEG 44', 'GUARD HIJOS MADRES ASEG 37',
  'GUARD HIJOS MADRES ASEG 36', 'GUARD HIJOS MADRES ASEG 02',
  'GUARD HIJOS MADRES ASEG 01',
  'DEPTO APOYO TEC 03', 'DEPTO APOYO TEC 02', 'DEPTO APOYO TEC 01',
  'DELEG 16', 'DELEG 15',
  'COMUNICACIONES ELECT 01',
  'C SEG SOCIAL 08', 'C SEG SOCIAL 07', 'C SEG SOCIAL 06',
  'C SEG SOCIAL 05', 'C SEG SOCIAL 04', 'C SEG SOCIAL 03',
  'C SEG SOCIAL 02', 'C SEG SOCIAL 01',
  'C REG SEG TRAB CAP PROD 01',
  'C CAP Y PRODUCTI 02', 'C CAP Y PRODUCTI 01',
  'ALMACEN GRAL DELEG 01',
] as const

// GOB CDMX alcaldías (Paperform field 4tu1o — shown only for GOB CDMX dependencia)
export const ALCALDIAS_GOB_CDMX_OPTIONS = [
  'Azcapotzalco',
  'Cuajimalpa',
  'Cuauhtemoc',
  'Gustavo A Madero',
  'Iztacalco',
  'Iztapalapa',
  'Miguel Hidalgo',
  'Tlahuac',
  'Venustiano Carranza',
] as const

// Health declaration
export const DECLARACION_SALUD_OPTIONS = ['Si', 'No'] as const
export const COVID_HISTORIAL_OPTIONS = ['Si', 'No'] as const
export const ASISTENCIA_RESPIRATORIA_OPTIONS = ['SI', 'NO'] as const
export const FUMA_OPTIONS = ['SI', 'NO'] as const

// Product variant
export const PRODUCTO_MODALIDAD_OPTIONS = [
  'Vida Mas Constante',
  'Vida Mas (No disponible para descuento via nomina)',
] as const

// Protection package
export const PAQUETE_PROTECCION_OPTIONS = [
  'Integral (Mas completo)',
  'Salud',
  'Accidentes',
  'Esencial',
] as const

// Payment period
export const PERIODO_PAGO_OPTIONS = ['Quincenal', 'Mensual', 'Anual'] as const

// Quote basis
export const BASE_CALCULO_OPTIONS = [
  'Prima, quiere pagar cierta cantidad',
  'Suma Asegurada, quiere cierta cantidad de proteccion',
] as const

// Existing policies flag
export const TIENE_OTRAS_POLIZAS_OPTIONS = ['Si', 'No'] as const

// SUBDELEGACION DIFERENTE flag (IMSS — Paperform field 7ua7e)
export const SUBDELEGACION_DIFERENTE_OPTIONS = ['Si', 'No'] as const

// Parentesco (beneficiaries) — from types.ts, ported here for consolidation
export const PARENTESCO_OPTIONS = [
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
] as const

// ============================================================
// PAPERFORM FIELD ID → solicitudes column mapping
// Source: paperform-field-mapping-review-2026-03-16.csv
// For use in ETL / backfill scripts
// ============================================================
export const PAPERFORM_FIELD_MAP: Record<string, string> = {
  // Agente
  'b4oka': 'clave_agente',
  '9n7b5': 'agente_cedula_vigente',
  '4eaif': 'rfc_ejecutivo',
  'eib9f': 'email_agente',

  // Fecha firma
  'd81e7': 'fecha_firma_dia',
  '6drpc': 'fecha_firma_mes',
  'b4miu': 'fecha_firma_anio',

  // Venta geografía
  '8pgv': 'estado_venta',
  '6qjgc': 'municipio_venta',

  // Contratante — identidad
  '3ebnv': 'contratante_nombres',
  '901ai': 'contratante_ap_paterno',
  '59hqo': 'contratante_ap_materno',
  '2n6kk': 'contratante_fecha_nacimiento_dia',
  'admv': 'contratante_fecha_nacimiento_mes',
  'd5ecc': 'contratante_fecha_nacimiento_anio',
  '8k8li': 'contratante_genero',
  '124v1': 'contratante_rfc',
  'ahae4': 'contratante_lugar_nacimiento',
  '1nibg': 'contratante_nacionalidad',
  '7f78b': 'contratante_identificacion_fiscal_extranjero',
  '22bkq': 'contratante_regimen_fiscal',
  'fel2u': 'contratante_tipo_identificacion',
  '6jlev': 'contratante_identificacion_emisor',
  'efdsn': 'contratante_identificacion_numero',

  // Contratante — domicilio
  '7n463': 'contratante_calle',
  'cfiog': 'contratante_numero_exterior',
  '1do4l': 'contratante_numero_interior',
  '2vl4j': 'contratante_cp',
  'pt9': 'contratante_colonia',
  'fpg82': 'contratante_estado',
  '35flt': 'contratante_municipio',
  '47faj': 'contratante_pais',
  '6k6f8': 'contratante_email',
  '4o85b': 'contratante_telefono_movil',
  'efnl': 'contratante_ocupacion',
  'fag7i': 'contratante_dependencia',

  // Cobro
  '1n28k': 'forma_cobro',
  'dn13i': 'imss_clave_delegacional',
  'bms51': 'llave_descuento',
  '63ij4': 'tipo_contrato',
  '7i4u9': 'ubicacion_nombre',
  '7ua7e': 'ubicacion_subdelegacion_diferente',
  '38qvp': 'numero_empleado',
  '4tu1o': 'alcaldia',
  'du8ho': 'edificio_ubicacion',
  '16qo': 'centro_trabajo_completo',
  '6vh9d': 'cct_prefix_2',
  '2uaat': 'sep_carta_autorizacion_ref',
  '5avef': 'issemym_clave',
  '5gqol': 'fecha_proximo_cobro',
  'a7m7d': 'metodo_pago_tarjeta_vencimiento',
  '34for': 'metodo_pago_clabe',
  '65num': 'metodo_pago_banco',
  'a116': 'metodo_pago_numero_tarjeta',

  // Asegurado — identidad (NOTE: CORRECTED per Opus audit C1)
  '7poah': 'asegurado_es_contratante',
  'ba1ij': 'asegurado_nombres',
  '1gvae': 'asegurado_ap_paterno',
  '3aqg8': 'asegurado_ap_materno',
  '5tfr2': 'asegurado_fecha_nacimiento_dia',
  '6s7ed': 'asegurado_fecha_nacimiento_mes',
  '4kqgs': 'asegurado_fecha_nacimiento_anio',
  'ep46p': 'asegurado_genero',
  'dkgeo': 'asegurado_rfc',              // ✅ CORRECTED: was contratante_rfc in original mapping
  '1lifc': 'asegurado_estado_nacimiento',
  'da3l1': 'asegurado_nacionalidad',     // ✅ CORRECTED: was contratante_nacionalidad
  'd6amg': 'asegurado_identificacion_fiscal_extranjero', // ✅ CORRECTED: was contratante_pais
  '89br9': 'asegurado_tipo_identificacion',
  'dm84j': 'asegurado_identificacion_emisor',
  'ensir': 'asegurado_identificacion_numero',
  '14o9v': 'asegurado_email',
  '197m3': 'asegurado_telefono_movil',
  '18idd': 'asegurado_ocupacion',

  // Asegurado — domicilio
  '8ivfg': 'asegurado_mismo_domicilio_contratante',
  '5v99c': 'asegurado_calle',
  '9mpd8': 'asegurado_numero_exterior',
  'f98f8': 'asegurado_numero_interior',
  'ctb4u': 'asegurado_cp',
  '92al3': 'asegurado_colonia',
  'dup5j': 'asegurado_municipio',        // ✅ CORRECTED: was solicitudes.alcaldia
  'c85nd': 'asegurado_estado',
  '7npe9': 'asegurado_pais',             // ✅ CORRECTED: was contratante_pais

  // Salud
  'a392h': 'declaracion_salud',
  'b5v1e': 'covid_historial',
  '3qim9': 'covid_dias_ultimo_resultado_positivo',
  't1iv': 'covid_asistencia_respiratoria',
  '9218h': 'asegurado_fuma',

  // Plan
  '19p7b': 'producto_modalidad',
  'ch9ma': 'paquete_proteccion',
  '8iloj': 'periodo_pago',
  'fjel5': 'base_calculo',
  '9lcsp': 'suma_asegurada_cotizada',
  '1eve8': 'prima_anual_riesgo',
  'ei7r3': 'prima_ahorro_anual',

  // Otras pólizas
  'ana7d': 'asegurado_tiene_otras_polizas',

  // Folio
  '7o5sb': 'folio',
}

// ============================================================
// PAPERFORM FILE FIELD IDs → solicitud_documentos column
// ============================================================
export const PAPERFORM_DOC_FIELD_MAP: Record<string, string> = {
  'bimvi': 'identificacion_frente',
  '2d2h2': 'identificacion_reverso',
  'c9ag5': 'comprobante_domicilio',
  'dg0kd': 'evidencia_cliente_con_talon_o_solicitud',
  'd0ro': 'talon_pago',
  '49m1b': 'signature_or_signed_request',
  'sr1t': 'carta_referido',
  '1dst0': 'carta_instruccion_imss',
  '3umte': 'carta_reserva_nomina_nomipay',
  'f17d5': 'consentimiento_descuento_gob_cdmx',
  '9tvu6': 'consentimiento_descuento',
  'bk7ke': 'carta_no_cancelacion_poliza_anterior',
  '371u8': 'solicitud_hoja_1',
  'dkvdk': 'solicitud_hoja_2',
  'ineq': 'solicitud_hoja_3',
  'ak3ca': 'solicitud_hoja_4',
  '83t59': 'solicitud_hoja_5',
  'dkd9e': 'solicitud_hoja_6',
  'dn3cj': 'video_aceptacion_poliza',
}
