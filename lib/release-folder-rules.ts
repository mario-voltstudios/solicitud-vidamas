export interface TipoContratacionRule {
  tc: string
  label: string
  concepto: string
  dependencia: string
  contrato: string
}

export interface FolioRule {
  dependencia: string
  folios: string[]
  note?: string
}

export const TIPO_CONTRATACION_RULES: TipoContratacionRule[] = [
  { tc: '01', label: 'Confianza', concepto: '195', dependencia: 'IMSS ACTIVOS', contrato: '15' },
  { tc: '02', label: 'Base', concepto: '195', dependencia: 'IMSS ACTIVOS', contrato: '15' },
  { tc: '07', label: 'Becados', concepto: '195', dependencia: 'IMSS ACTIVOS', contrato: '15' },
  { tc: '09', label: 'Residentes', concepto: '195', dependencia: 'IMSS ACTIVOS', contrato: '15' },
  { tc: '10', label: 'Jub. Ant.', concepto: '395', dependencia: 'IMSS JUBILADOS', contrato: '16' },
  { tc: '11', label: 'Jub. Act.', concepto: '395', dependencia: 'IMSS JUBILADOS', contrato: '16' },
  { tc: '0', label: 'Estatuto A', concepto: '995', dependencia: 'IMSS ESTATUTO A', contrato: '17' },
  { tc: 'MANDOS', label: 'Mandos Superiores', concepto: '195', dependencia: 'IMSS MANDOS', contrato: '18' },
]

export const FOLIO_RULES: FolioRule[] = [
  { dependencia: 'IMSS (General DXN)', folios: ['N0058293'] },
  { dependencia: 'IMSS EM Oriente', folios: ['N0063319'] },
  { dependencia: 'IMSS EM Poniente', folios: ['N0080385'] },
  { dependencia: 'IMSS Activos 2 Noreste D.F.', folios: ['N0084530'] },
  { dependencia: 'IMSS Oaxaca Prospera', folios: ['N0029858'] },
  { dependencia: 'IMSS Morelos Próspera', folios: ['N0091500'] },
  { dependencia: 'IMSS Querétaro Prospera', folios: ['N0091583'] },
  { dependencia: 'ISSSTE (DXN Nomina)', folios: ['N0051765'] },
  { dependencia: 'GOB CDMX (DXN Quincenal)', folios: ['N0073208'] },
  { dependencia: 'SEP Media Superior', folios: ['N0058292', 'N0064867'] },
  { dependencia: 'SEP Central', folios: ['N0064865', 'N0082480'] },
  { dependencia: 'SEP Central Prospera', folios: ['N0083013'] },
  { dependencia: 'UAQ', folios: ['N0091588'] },
  { dependencia: 'GEM (Banco Quincenal Prospera)', folios: ['N0078461'] },
  { dependencia: 'Familiares y Empresarial (Banco)', folios: ['N0078790'] },
  { dependencia: 'Guardia Nacional (Banco Quincenal)', folios: ['N0080562'] },
  { dependencia: 'ISSSTE Auto Domiciliación', folios: ['P0076946'] },
  { dependencia: 'SEP Auto Domiciliación', folios: ['P0076945'] },
  { dependencia: 'Gob CDMX Auto Domiciliación', folios: ['P0073208'] },
  { dependencia: 'G Nacional Auto Domiciliación', folios: ['P0081272'] },
  { dependencia: 'TMK Auto Domiciliación', folios: ['P0081271'] },
  { dependencia: 'Educación Tabasco Próspera', folios: ['P0093743'] },
]

export function matchTipoContratacion(tc?: string | null) {
  const value = (tc || '').trim().toUpperCase()
  return TIPO_CONTRATACION_RULES.find((rule) => rule.tc === value)
}

export function matchFoliosByDependencia(text?: string | null) {
  const value = (text || '').trim().toUpperCase()
  if (!value) return []
  return FOLIO_RULES.filter((rule) => rule.dependencia.toUpperCase().includes(value))
}
