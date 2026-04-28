// ============================================================
// Tarifarios — Client-side quote fetching and validation
// ============================================================

import type { FormData } from './types'

export interface QuoteResult {
  suma_asegurada: number
  edad_calculo: number
  descuentos_aplicados: string[]
  prima_quincenal: number
  plan: string
  risk_type: string
  data_quality: string
}

export interface QuoteApiResponse {
  success: boolean
  quote?: QuoteResult
  error?: string
}

/**
 * Calculate age from YYYY-MM-DD date of birth.
 * Returns age in completed years.
 */
export function calcularEdad(fechaNac: string): number {
  if (!fechaNac) return 0
  const birth = new Date(fechaNac)
  if (isNaN(birth.getTime())) return 0
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

/**
 * Fetch a quote from the API.
 * Uses the asegurado's DOB if available, otherwise the contratante's.
 */
export async function fetchQuote(formData: FormData): Promise<QuoteApiResponse> {
  const plan = formData.plan
  const prima = parseFloat(formData.prima_base || '0')

  if (!plan || !prima || prima <= 0) {
    return { success: false, error: 'Selecciona un plan y captura la prima antes de cotizar.' }
  }

  // Use asegurado DOB if available (may differ from contratante), else contratante
  const dob = formData.misma_persona
    ? formData.contratante_fecha_nac
    : (formData.asegurado_fecha_nac || formData.contratante_fecha_nac)

  const edad = calcularEdad(dob)
  if (edad < 15 || edad > 65) {
    return { success: false, error: `Edad fuera de rango (15-65 años). Edad detectada: ${edad}.` }
  }

  const genero = formData.misma_persona
    ? formData.contratante_genero
    : (formData.asegurado_genero || formData.contratante_genero)

  if (!genero || !['M', 'F'].includes(genero)) {
    return { success: false, error: 'Género es requerido para cotizar.' }
  }

  try {
    const res = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan,
        prima_quincenal: prima,
        edad_real: edad,
        genero,
        no_fumar: true, // Default assumption — no_fumar = true
        risk_type: 'estandar',
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Error al calcular cotización.' }
    }

    return { success: true, quote: data.quote }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error de conexión'
    return { success: false, error: `No se pudo obtener la cotización: ${msg}` }
  }
}

/**
 * Validate that a quote is consistent with the dependencia rules.
 * Returns an array of warning strings (empty = valid).
 */
export function validateQuoteForDependencia(
  quote: QuoteResult,
  formData: FormData
): string[] {
  const warnings: string[] = []

  // Check plan is one of the 4 GNP plans
  const validPlans = ['Integral', 'Salud', 'Accidentes', 'Esencial']
  if (!validPlans.includes(quote.plan)) {
    warnings.push(`Plan "${quote.plan}" no es uno de los 4 planes GNP reconocidos.`)
  }

  // Check prima matches what was entered
  const primaEntered = parseFloat(formData.prima_base || '0')
  if (Math.abs(quote.prima_quincenal - primaEntered) > 0.01) {
    warnings.push(
      `La prima cotizada ($${quote.prima_quincenal}) no coincide con la capturada ($${primaEntered}).`
    )
  }

  // Check data quality
  if (quote.data_quality === 'interpolated') {
    warnings.push('La tarifa fue interpolada (no exacta). Verifica el monto con el tarifario oficial.')
  } else if (quote.data_quality !== 'exact') {
    warnings.push(`Calidad de datos: "${quote.data_quality}". Verifica con el tarifario oficial.`)
  }

  // Validate Suma Asegurada is reasonable (> 0)
  if (!quote.suma_asegurada || quote.suma_asegurada <= 0) {
    warnings.push('La suma asegurada calculada es 0 o inválida.')
  }

  return warnings
}

/**
 * Map FormData plan names to the tarifario plan names.
 * The form uses "Integral", "Salud" — the DB also uses these.
 * Just ensure consistency.
 */
export function normalizePlanName(plan: string): string {
  const map: Record<string, string> = {
    'integral': 'Integral',
    'salud': 'Salud',
    'accidentes': 'Accidentes',
    'esencial': 'Esencial',
  }
  return map[plan.toLowerCase()] || plan
}
