'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormData } from '@/lib/types'

interface StepPlanProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepPlan({ formData, setFormData, onNext, onBack }: StepPlanProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  function update(field: keyof FormData, value: string) {
    setFormData({ [field]: value })
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!formData.plan) newErrors.plan = 'Selecciona el plan'
    if (!formData.periodicidad) newErrors.periodicidad = 'Selecciona la periodicidad'
    if (!formData.prima_base) newErrors.prima_base = 'Requerido'
    if (!formData.suma_asegurada) newErrors.suma_asegurada = 'Requerido'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return false
    }
    return true
  }

  const inputClass = "h-11 text-base"
  const errorClass = "text-red-500 text-xs mt-1"

  const selectedPrimaLabel = formData.periodicidad === 'quincenal' ? 'Prima Quincenal' :
    formData.periodicidad === 'mensual' ? 'Prima Mensual' : 'Prima'

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Plan y Cobertura</h2>
        <p className="text-sm text-gray-500">Producto: Vida Más Constante — GNP</p>
      </div>

      {/* Plan selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Tipo de Plan *
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => update('plan', 'Integral')}
              className={`
                p-4 rounded-xl border-2 text-center transition-all
                ${formData.plan === 'Integral'
                  ? 'border-[#003087] bg-blue-50'
                  : 'border-gray-200 bg-white'}
              `}
            >
              <div className="text-2xl mb-2">🛡️</div>
              <div className="font-semibold text-sm">Integral</div>
              <div className="text-xs text-gray-500 mt-1">Vida + Salud</div>
            </button>

            <button
              onClick={() => update('plan', 'Salud')}
              className={`
                p-4 rounded-xl border-2 text-center transition-all
                ${formData.plan === 'Salud'
                  ? 'border-[#003087] bg-blue-50'
                  : 'border-gray-200 bg-white'}
              `}
            >
              <div className="text-2xl mb-2">❤️</div>
              <div className="font-semibold text-sm">Salud</div>
              <div className="text-xs text-gray-500 mt-1">Solo salud</div>
            </button>
          </div>
          {errors.plan && <p className={errorClass}>{errors.plan}</p>}
        </CardContent>
      </Card>

      {/* Periodicidad */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Periodicidad de Pago *
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => update('periodicidad', 'quincenal')}
              className={`
                p-4 rounded-xl border-2 text-center transition-all
                ${formData.periodicidad === 'quincenal'
                  ? 'border-[#003087] bg-blue-50'
                  : 'border-gray-200 bg-white'}
              `}
            >
              <div className="text-2xl mb-2">📅</div>
              <div className="font-semibold text-sm">Quincenal</div>
              <div className="text-xs text-gray-500 mt-1">Cada 15 días</div>
            </button>

            <button
              onClick={() => update('periodicidad', 'mensual')}
              className={`
                p-4 rounded-xl border-2 text-center transition-all
                ${formData.periodicidad === 'mensual'
                  ? 'border-[#003087] bg-blue-50'
                  : 'border-gray-200 bg-white'}
              `}
            >
              <div className="text-2xl mb-2">📆</div>
              <div className="font-semibold text-sm">Mensual</div>
              <div className="text-xs text-gray-500 mt-1">Una vez al mes</div>
            </button>
          </div>
          {errors.periodicidad && <p className={errorClass}>{errors.periodicidad}</p>}
        </CardContent>
      </Card>

      {/* Montos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Montos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Base cálculo */}
          <div>
            <Label className="text-sm font-medium text-gray-600 mb-2 block">
              Base de cálculo
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => update('base_calculo', 'prima')}
                className={`
                  p-3 rounded-lg border-2 text-center text-sm transition-all
                  ${formData.base_calculo === 'prima'
                    ? 'border-[#003087] bg-blue-50 text-[#003087] font-semibold'
                    : 'border-gray-200 text-gray-600'}
                `}
              >
                Fijar Prima
              </button>
              <button
                onClick={() => update('base_calculo', 'sa')}
                className={`
                  p-3 rounded-lg border-2 text-center text-sm transition-all
                  ${formData.base_calculo === 'sa'
                    ? 'border-[#003087] bg-blue-50 text-[#003087] font-semibold'
                    : 'border-gray-200 text-gray-600'}
                `}
              >
                Fijar Suma Aseg.
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="prima">{selectedPrimaLabel} *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
              <Input
                id="prima"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.prima_base}
                onChange={(e) => update('prima_base', e.target.value)}
                className={`${inputClass} pl-7`}
                min="0"
                step="0.01"
              />
            </div>
            {errors.prima_base && <p className={errorClass}>{errors.prima_base}</p>}
          </div>

          <div>
            <Label htmlFor="prima_adicional">Prima Adicional (opcional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
              <Input
                id="prima_adicional"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.prima_adicional}
                onChange={(e) => update('prima_adicional', e.target.value)}
                className={`${inputClass} pl-7`}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="suma_asegurada">Suma Asegurada *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
              <Input
                id="suma_asegurada"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.suma_asegurada}
                onChange={(e) => update('suma_asegurada', e.target.value)}
                className={`${inputClass} pl-7`}
                min="0"
                step="1000"
              />
            </div>
            {errors.suma_asegurada && <p className={errorClass}>{errors.suma_asegurada}</p>}
          </div>

          {/* Summary */}
          {formData.plan && formData.periodicidad && formData.prima_base && (
            <div className="bg-[#003087] text-white rounded-xl p-4 mt-2">
              <p className="text-xs opacity-75 mb-1">Resumen del plan</p>
              <p className="text-lg font-bold">{formData.plan} {formData.periodicidad}</p>
              <p className="text-sm opacity-90">
                Prima: ${parseFloat(formData.prima_base || '0').toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                {formData.prima_adicional && parseFloat(formData.prima_adicional) > 0
                  ? ` + $${parseFloat(formData.prima_adicional).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                  : ''}
              </p>
              {formData.suma_asegurada && (
                <p className="text-sm opacity-90">
                  SA: ${parseFloat(formData.suma_asegurada || '0').toLocaleString('es-MX')}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12">
          ← Atrás
        </Button>
        <Button onClick={() => { if (validate()) onNext() }} className="flex-1 h-12 bg-[#003087] hover:bg-[#002070]">
          Continuar →
        </Button>
      </div>
    </div>
  )
}
