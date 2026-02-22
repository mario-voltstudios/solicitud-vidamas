'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { validateAgente, getCurrentSemana, generateFolio } from '@/app/solicitud/actions'
import { FormData } from '@/lib/types'

interface StepAgentProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
}

export default function StepAgent({ formData, setFormData, onNext }: StepAgentProps) {
  const [clave, setClave] = useState(formData.clave_agente || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [validated, setValidated] = useState(!!formData.nombre_agente)

  async function handleValidate() {
    if (!clave.trim()) {
      setError('Por favor ingresa tu clave de agente')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await validateAgente(clave.trim())

      if (!result.success || !result.agente) {
        setError(result.error || 'Clave no válida')
        return
      }

      const semana = await getCurrentSemana()
      if (!semana) {
        setError('Error al obtener la semana actual. Contacta al administrador.')
        return
      }

      const folio = await generateFolio(clave.trim(), semana)

      setFormData({
        clave_agente: clave.trim(),
        nombre_agente: result.agente.nombre_completo,
        folio,
        semana_id: semana.id,
        week_number: semana.week_number,
        year: semana.year,
      })

      setValidated(true)
    } catch (err) {
      setError('Error de conexión. Verifica tu señal e intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleValidate()
    }
  }

  return (
    <div className="space-y-6">
      {/* GNP Branding */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-[#003087] rounded-full mb-3">
          <span className="text-white text-2xl font-bold">G</span>
        </div>
        <h1 className="text-xl font-bold text-[#003087]">GNP Seguros</h1>
        <p className="text-sm text-gray-500">Solicitud Vida Más Constante</p>
      </div>

      {!validated ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label htmlFor="clave" className="text-base font-medium">
                Clave de Agente
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Ingresa tu número de clave para comenzar
              </p>
              <Input
                id="clave"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Ej: 4500"
                value={clave}
                onChange={(e) => {
                  setClave(e.target.value)
                  setError('')
                  setValidated(false)
                }}
                onKeyPress={handleKeyPress}
                className="text-lg h-12"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">⚠️ {error}</p>
              </div>
            )}

            <Button
              onClick={handleValidate}
              disabled={loading || !clave.trim()}
              className="w-full h-12 bg-[#003087] hover:bg-[#002070] text-base"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Verificando...
                </span>
              ) : (
                'Verificar Clave'
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg">✓</span>
              </div>
              <div>
                <p className="text-sm text-green-600 font-medium">Agente verificado</p>
                <p className="text-lg font-bold text-gray-800">{formData.nombre_agente}</p>
                <p className="text-sm text-gray-500">Clave: {formData.clave_agente}</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-green-200">
              <p className="text-xs text-gray-500 mb-1">Folio de solicitud</p>
              <p className="text-lg font-mono font-bold text-[#003087]">{formData.folio}</p>
              <p className="text-xs text-gray-400">
                Semana {formData.week_number} / {formData.year}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setValidated(false)
                  setClave('')
                  setFormData({ clave_agente: '', nombre_agente: '', folio: '' })
                }}
                className="flex-1"
              >
                Cambiar clave
              </Button>
              <Button
                onClick={onNext}
                className="flex-1 bg-[#003087] hover:bg-[#002070]"
              >
                Continuar →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!validated && (
        <p className="text-center text-xs text-gray-400">
          ¿Problemas con tu clave? Contacta a tu gerente
        </p>
      )}
    </div>
  )
}
