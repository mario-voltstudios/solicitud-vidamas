'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormData, Beneficiario, PARENTESCOS } from '@/lib/types'

interface StepBeneficiariosProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

function newBeneficiario(): Beneficiario {
  return {
    id: Math.random().toString(36).substr(2, 9),
    nombres: '',
    ap_paterno: '',
    ap_materno: '',
    parentesco: '',
    fecha_nac: '',
    porcentaje: 0,
  }
}

export default function StepBeneficiarios({ formData, setFormData, onNext, onBack }: StepBeneficiariosProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const beneficiarios = formData.beneficiarios || []

  const totalPorcentaje = beneficiarios.reduce((sum, b) => sum + (Number(b.porcentaje) || 0), 0)

  function addBeneficiario() {
    const newB = newBeneficiario()
    // Auto-distribute percentages
    const remaining = 100 - totalPorcentaje
    newB.porcentaje = Math.max(0, remaining)
    setFormData({ beneficiarios: [...beneficiarios, newB] })
    setErrors({})
  }

  function removeBeneficiario(id: string) {
    setFormData({ beneficiarios: beneficiarios.filter(b => b.id !== id) })
    setErrors({})
  }

  function updateBeneficiario(id: string, field: keyof Beneficiario, value: string | number) {
    const updated = beneficiarios.map(b =>
      b.id === id ? { ...b, [field]: value } : b
    )
    setFormData({ beneficiarios: updated })
    const errKey = `${id}_${field}`
    if (errors[errKey]) setErrors(prev => ({ ...prev, [errKey]: '' }))
  }

  function distributeEqually() {
    if (beneficiarios.length === 0) return
    const perBeneficiary = Math.floor(100 / beneficiarios.length)
    const remainder = 100 - perBeneficiary * beneficiarios.length
    const updated = beneficiarios.map((b, i) => ({
      ...b,
      porcentaje: i === 0 ? perBeneficiary + remainder : perBeneficiary,
    }))
    setFormData({ beneficiarios: updated })
  }

  function validate() {
    if (beneficiarios.length === 0) {
      setErrors({ general: 'Debes agregar al menos un beneficiario' })
      return false
    }
    const newErrors: Record<string, string> = {}
    beneficiarios.forEach(b => {
      if (!b.nombres) newErrors[`${b.id}_nombres`] = 'Requerido'
      if (!b.ap_paterno) newErrors[`${b.id}_ap_paterno`] = 'Requerido'
      if (!b.parentesco) newErrors[`${b.id}_parentesco`] = 'Requerido'
      if (!b.porcentaje || b.porcentaje <= 0) newErrors[`${b.id}_porcentaje`] = 'Requerido'
    })
    if (Math.abs(totalPorcentaje - 100) > 0.01) {
      newErrors.total = `Los porcentajes suman ${totalPorcentaje}%, deben sumar 100%`
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return false
    }
    return true
  }

  const inputClass = "h-10 text-sm"
  const errorClass = "text-red-500 text-xs mt-1"

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Beneficiarios</h2>
        <p className="text-sm text-gray-500">
          Personas que recibirán el beneficio en caso de siniestro
        </p>
      </div>

      {/* Percentage indicator */}
      <div className={`
        flex items-center justify-between p-3 rounded-xl
        ${Math.abs(totalPorcentaje - 100) < 0.01
          ? 'bg-green-50 border border-green-200'
          : 'bg-amber-50 border border-amber-200'}
      `}>
        <span className="text-sm font-medium">Total asignado:</span>
        <span className={`text-lg font-bold ${Math.abs(totalPorcentaje - 100) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
          {totalPorcentaje}%
          {Math.abs(totalPorcentaje - 100) < 0.01 && ' ✓'}
        </span>
      </div>
      {errors.total && <p className={errorClass}>{errors.total}</p>}
      {errors.general && <p className={errorClass}>{errors.general}</p>}

      {/* Beneficiaries list */}
      {beneficiarios.map((b, index) => (
        <Card key={b.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-[#003087]">
                Beneficiario {index + 1}
              </CardTitle>
              <button
                onClick={() => removeBeneficiario(b.id)}
                className="text-red-400 hover:text-red-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Nombre(s) *</Label>
              <Input
                placeholder="Nombre(s)"
                value={b.nombres}
                onChange={(e) => updateBeneficiario(b.id, 'nombres', e.target.value.toUpperCase())}
                className={inputClass}
              />
              {errors[`${b.id}_nombres`] && <p className={errorClass}>{errors[`${b.id}_nombres`]}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Ap. Paterno *</Label>
                <Input
                  placeholder="Paterno"
                  value={b.ap_paterno}
                  onChange={(e) => updateBeneficiario(b.id, 'ap_paterno', e.target.value.toUpperCase())}
                  className={inputClass}
                />
                {errors[`${b.id}_ap_paterno`] && <p className={errorClass}>{errors[`${b.id}_ap_paterno`]}</p>}
              </div>
              <div>
                <Label className="text-xs">Ap. Materno</Label>
                <Input
                  placeholder="Materno"
                  value={b.ap_materno}
                  onChange={(e) => updateBeneficiario(b.id, 'ap_materno', e.target.value.toUpperCase())}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Parentesco *</Label>
                <Select value={b.parentesco} onValueChange={(v) => updateBeneficiario(b.id, 'parentesco', v)}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Parentesco" />
                  </SelectTrigger>
                  <SelectContent>
                    {PARENTESCOS.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors[`${b.id}_parentesco`] && <p className={errorClass}>{errors[`${b.id}_parentesco`]}</p>}
              </div>
              <div>
                <Label className="text-xs">Fecha Nacimiento</Label>
                <Input
                  type="date"
                  value={b.fecha_nac}
                  onChange={(e) => updateBeneficiario(b.id, 'fecha_nac', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Porcentaje (%) *</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={b.porcentaje || ''}
                  onChange={(e) => updateBeneficiario(b.id, 'porcentaje', parseFloat(e.target.value) || 0)}
                  className={`${inputClass} flex-1`}
                  min="1"
                  max="100"
                />
                <span className="text-gray-500 font-medium">%</span>
              </div>
              {errors[`${b.id}_porcentaje`] && <p className={errorClass}>{errors[`${b.id}_porcentaje`]}</p>}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          onClick={addBeneficiario}
          variant="outline"
          className="flex-1 h-12 border-[#003087] text-[#003087] border-dashed"
        >
          + Agregar Beneficiario
        </Button>
        {beneficiarios.length > 1 && (
          <Button
            onClick={distributeEqually}
            variant="outline"
            className="h-12 text-xs"
          >
            Repartir<br/>igual
          </Button>
        )}
      </div>

      {beneficiarios.length === 0 && (
        <div className="text-center py-6 text-gray-400">
          <p className="text-4xl mb-2">👤</p>
          <p className="text-sm">No hay beneficiarios aún</p>
          <p className="text-xs">Toca el botón de arriba para agregar</p>
        </div>
      )}

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
