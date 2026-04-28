'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormData, QuoteConfirmation } from '@/lib/types'
import { fetchQuote, validateQuoteForDependencia, calcularEdad, QuoteResult } from '@/lib/tarifarios'

interface StepTarifarioProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

type QuoteStatus = 'loading' | 'ready' | 'error' | 'confirmed' | 'mismatch'

function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function StepTarifario({ formData, setFormData, onNext, onBack }: StepTarifarioProps) {
  const [status, setStatus] = useState<QuoteStatus>('loading')
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)

  const loadQuote = useCallback(async () => {
    setStatus('loading')
    setError('')
    setWarnings([])

    const result = await fetchQuote(formData)

    if (!result.success || !result.quote) {
      setStatus('error')
      setError(result.error || 'No se pudo obtener la cotización.')
      return
    }

    setQuote(result.quote)

    // Validate against dependencia rules
    const warns = validateQuoteForDependencia(result.quote, formData)
    setWarnings(warns)

    setStatus('ready')
  }, [formData])

  useEffect(() => {
    loadQuote()
  }, [loadQuote])

  function handleConfirm() {
    if (!quote) return

    const confirmation: QuoteConfirmation = {
      plan: quote.plan,
      prima_quincenal: quote.prima_quincenal,
      suma_asegurada: quote.suma_asegurada,
      edad_calculo: quote.edad_calculo,
      descuentos_aplicados: quote.descuentos_aplicados,
      data_quality: quote.data_quality,
      confirmed_at: new Date().toISOString(),
    }

    setFormData({
      quote_confirmation: confirmation,
      // Also update suma_asegurada if it was empty
      ...(formData.suma_asegurada ? {} : { suma_asegurada: String(quote.suma_asegurada) }),
    })
    setConfirmed(true)
    setStatus('confirmed')
  }

  function handleRequote() {
    setConfirmed(false)
    setQuote(null)
    loadQuote()
  }

  const dob = formData.misma_persona
    ? formData.contratante_fecha_nac
    : (formData.asegurado_fecha_nac || formData.contratante_fecha_nac)
  const edad = calcularEdad(dob)
  const genero = formData.misma_persona
    ? formData.contratante_genero
    : (formData.asegurado_genero || formData.contratante_genero)

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Confirmación de Cotización</h2>
        <p className="text-sm text-gray-500">Verifica que la prima y cobertura sean correctas</p>
      </div>

      {/* Loading */}
      {status === 'loading' && (
        <Card>
          <CardContent className="pt-6 pb-6 text-center">
            <svg className="animate-spin h-8 w-8 text-[#003087] mx-auto mb-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-600">Consultando tarifario...</p>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status === 'error' && (
        <Card className="border-red-200">
          <CardContent className="pt-6 pb-6">
            <div className="text-center">
              <span className="text-red-500 text-3xl block mb-2">⚠️</span>
              <p className="text-sm text-red-700 font-medium mb-1">No se pudo cotizar</p>
              <p className="text-xs text-red-600 mb-4">{error}</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={onBack} className="text-sm">
                  ← Atrás
                </Button>
                <Button onClick={loadQuote} className="text-sm bg-[#003087] hover:bg-[#002070]">
                  Reintentar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quote Card — Ready or Confirmed */}
      {(status === 'ready' || status === 'confirmed') && quote && (
        <>
          {/* Parameters used */}
          <Card className="bg-gray-50">
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>
                  <span className="font-medium">Plan:</span> {quote.plan}
                </div>
                <div>
                  <span className="font-medium">Prima:</span> {formatCurrency(quote.prima_quincenal)}/quincena
                </div>
                <div>
                  <span className="font-medium">Edad:</span> {edad} años → cálculo: {quote.edad_calculo}
                </div>
                <div>
                  <span className="font-medium">Género:</span> {genero === 'M' ? 'Masculino' : 'Femenino'}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main quote card */}
          <Card className={`border-2 ${confirmed ? 'border-green-400 bg-green-50' : 'border-[#003087]'}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-[#003087]">
                  {confirmed ? '✅ Cotización Confirmada' : 'Tu Cotización'}
                </CardTitle>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  quote.data_quality === 'exact'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {quote.data_quality === 'exact' ? 'Tarifa exacta' : 'Interpolada'}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Plan name */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Plan</p>
                <p className="text-lg font-bold text-gray-900">Vida Más {quote.plan}</p>
              </div>

              {/* Prima */}
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Prima Quincenal</p>
                  <p className="text-2xl font-bold text-[#003087]">
                    {formatCurrency(quote.prima_quincenal)}
                  </p>
                </div>
                <div className="pb-0.5">
                  <p className="text-xs text-gray-400">
                    ({formatCurrency(quote.prima_quincenal * 2)}/mes)
                  </p>
                </div>
              </div>

              {/* Suma Asegurada */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Suma Asegurada</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(quote.suma_asegurada)}
                </p>
              </div>

              {/* Descuentos */}
              {quote.descuentos_aplicados && quote.descuentos_aplicados.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Descuentos aplicados</p>
                  <div className="flex flex-wrap gap-1">
                    {quote.descuentos_aplicados.map((d) => (
                      <span key={d} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cobertura */}
              <div className="border-t border-gray-200 pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Cobertura</p>
                <ul className="text-xs text-gray-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <span className="text-green-500">✓</span> Muerte natural y accidental
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-500">✓</span> Invalidez total y permanente
                  </li>
                  {quote.plan === 'Integral' && (
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span> Cobertura de salud incluida
                    </li>
                  )}
                  {quote.plan === 'Salud' && (
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span> Cobertura de salud
                    </li>
                  )}
                  {quote.plan === 'Accidentes' && (
                    <li className="flex items-center gap-2">
                      <span className="text-green-500">✓</span> Cobertura por accidentes
                    </li>
                  )}
                  <li className="flex items-center gap-2">
                    <span className="text-green-500">✓</span> Periodicidad: quincenal (descuento nómina)
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-sm font-medium text-amber-900 mb-1">⚠️ Revisar antes de confirmar</p>
              <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Confirm button */}
          {status === 'ready' && !confirmed && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <p className="text-xs text-blue-700 mb-2">
                ¿La prima y la suma asegurada son correctas?
              </p>
              <p className="text-xs text-blue-600 mb-3">
                Confirma que el monto, la periodicidad y el plan coinciden con lo acordado con el cliente.
              </p>
            </div>
          )}

          {/* Confirmed banner */}
          {confirmed && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-sm font-medium text-green-800">
                ✅ Cotización confirmada — puedes continuar
              </p>
              <button
                onClick={handleRequote}
                className="text-xs text-green-600 underline mt-1"
              >
                Recotizar con otros parámetros
              </button>
            </div>
          )}
        </>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12">
          ← Atrás
        </Button>
        {confirmed ? (
          <Button onClick={onNext} className="flex-1 h-12 bg-[#003087] hover:bg-[#002070]">
            Continuar →
          </Button>
        ) : status === 'ready' ? (
          <Button onClick={handleConfirm} className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white">
            ✓ Confirmar Cotización
          </Button>
        ) : (
          <Button disabled className="flex-1 h-12 bg-gray-300 text-gray-500 cursor-not-allowed">
            Confirmar Cotización
          </Button>
        )}
      </div>
    </div>
  )
}
