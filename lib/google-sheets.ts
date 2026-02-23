'use server'

import { google } from 'googleapis'
import { FormData } from '@/lib/types'

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1FRxId1AfzQ-fAjiyPr_qc-Dv9hOsqkEJmb5TeH-Y3MA'
const SHEET_NAME = 'Solicitudes'

function getSheetsClient() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')

  const sa = typeof saJson === 'string' ? JSON.parse(saJson) : saJson

  const authClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    subject: 'mario@veseguro.com',
  })

  return google.sheets({ version: 'v4', auth: authClient })
}

export async function appendToSheet(formData: FormData): Promise<void> {
  const sheets = getSheetsClient()

  const contratanteNombreCompleto = [
    formData.contratante_nombres,
    formData.contratante_ap_paterno,
    formData.contratante_ap_materno,
  ]
    .filter(Boolean)
    .join(' ')

  const row = [
    formData.folio || '',
    formData.clave_agente || '',
    new Date().toISOString().split('T')[0], // fecha_firma
    contratanteNombreCompleto,
    formData.contratante_rfc || '',
    formData.contratante_email || '',
    formData.contratante_telefono || '',
    formData.forma_cobro || '',
    formData.contratante_dependencia || '',
    formData.matricula || '',
    formData.plan || '',
    formData.periodicidad || '',
    formData.prima_base || '',
    formData.prima_adicional || '',
    formData.suma_asegurada || '',
    formData.beneficiarios ? JSON.stringify(formData.beneficiarios) : '[]',
    'pendiente', // status
    new Date().toISOString(), // created_at
    formData.nexos_delincuencia || 'no', // nexos_delincuencia
    'Prospera', // gerente_comercial
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:T`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  })

  console.log(`[Sheets] Row appended for folio ${formData.folio}`)
}
