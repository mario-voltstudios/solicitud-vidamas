'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormData } from '@/lib/types'

interface StepAseguradoProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepAsegurado({ formData, setFormData, onNext, onBack }: StepAseguradoProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  function update(field: keyof FormData, value: string | boolean) {
    setFormData({ [field]: value })
    if (errors[field as string]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  function setMismaPersona(v: boolean) {
    setFormData({ misma_persona: v })
  }

  function validate() {
    if (formData.misma_persona) return true
    const newErrors: Record<string, string> = {}
    if (!formData.asegurado_nombres) newErrors.asegurado_nombres = 'Requerido'
    if (!formData.asegurado_ap_paterno) newErrors.asegurado_ap_paterno = 'Requerido'
    if (!formData.asegurado_fecha_nac) newErrors.asegurado_fecha_nac = 'Requerido'
    if (!formData.asegurado_genero) newErrors.asegurado_genero = 'Requerido'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return false
    }
    return true
  }

  const inputClass = "h-11 text-base"
  const errorClass = "text-red-500 text-xs mt-1"

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Asegurado</h2>
        <p className="text-sm text-gray-500">¿Quién es la persona asegurada?</p>
      </div>

      {/* Same person selector */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMismaPersona(true)}
          className={`
            p-4 rounded-xl border-2 text-left transition-all
            ${formData.misma_persona
              ? 'border-[#003087] bg-blue-50'
              : 'border-gray-200 bg-white'}
          `}
        >
          <div className="text-2xl mb-2">👤</div>
          <div className="font-semibold text-sm text-gray-800">Misma persona</div>
          <div className="text-xs text-gray-500 mt-1">El contratante es el asegurado</div>
        </button>

        <button
          onClick={() => setMismaPersona(false)}
          className={`
            p-4 rounded-xl border-2 text-left transition-all
            ${!formData.misma_persona
              ? 'border-[#003087] bg-blue-50'
              : 'border-gray-200 bg-white'}
          `}
        >
          <div className="text-2xl mb-2">👥</div>
          <div className="font-semibold text-sm text-gray-800">Persona diferente</div>
          <div className="text-xs text-gray-500 mt-1">El asegurado es otra persona</div>
        </button>
      </div>

      {formData.misma_persona ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">✅</span>
              <div>
                <p className="font-semibold text-green-700">Datos del contratante copiados</p>
                <p className="text-sm text-green-600">
                  {formData.contratante_nombres} {formData.contratante_ap_paterno} {formData.contratante_ap_materno}
                </p>
                {formData.contratante_fecha_nac && (
                  <p className="text-xs text-green-500">
                    Nacimiento: {formData.contratante_fecha_nac}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              Datos del Asegurado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Nombre(s) *</Label>
              <Input
                placeholder="Nombre(s)"
                value={formData.asegurado_nombres}
                onChange={(e) => update('asegurado_nombres', e.target.value.toUpperCase())}
                className={inputClass}
              />
              {errors.asegurado_nombres && <p className={errorClass}>{errors.asegurado_nombres}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Apellido Paterno *</Label>
                <Input
                  placeholder="Paterno"
                  value={formData.asegurado_ap_paterno}
                  onChange={(e) => update('asegurado_ap_paterno', e.target.value.toUpperCase())}
                  className={inputClass}
                />
                {errors.asegurado_ap_paterno && <p className={errorClass}>{errors.asegurado_ap_paterno}</p>}
              </div>
              <div>
                <Label>Apellido Materno</Label>
                <Input
                  placeholder="Materno"
                  value={formData.asegurado_ap_materno}
                  onChange={(e) => update('asegurado_ap_materno', e.target.value.toUpperCase())}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Fecha Nacimiento *</Label>
                <Input
                  type="date"
                  value={formData.asegurado_fecha_nac}
                  onChange={(e) => update('asegurado_fecha_nac', e.target.value)}
                  className={inputClass}
                />
                {errors.asegurado_fecha_nac && <p className={errorClass}>{errors.asegurado_fecha_nac}</p>}
              </div>
              <div>
                <Label>Género *</Label>
                <Select value={formData.asegurado_genero} onValueChange={(v) => update('asegurado_genero', v)}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Género" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Femenino</SelectItem>
                  </SelectContent>
                </Select>
                {errors.asegurado_genero && <p className={errorClass}>{errors.asegurado_genero}</p>}
              </div>
            </div>

            <div>
              <Label>RFC</Label>
              <Input
                placeholder="RFC (opcional)"
                value={formData.asegurado_rfc}
                onChange={(e) => update('asegurado_rfc', e.target.value.toUpperCase())}
                maxLength={13}
                className={`${inputClass} font-mono`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12">
          ← Atrás
        </Button>
        <Button
          onClick={() => { if (validate()) onNext() }}
          className="flex-1 h-12 bg-[#003087] hover:bg-[#002070]"
        >
          Continuar →
        </Button>
      </div>
    </div>
  )
}
