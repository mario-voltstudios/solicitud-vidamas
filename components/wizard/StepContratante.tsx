'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormData, ESTADOS_MX } from '@/lib/types'

interface StepContratanteProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepContratante({ formData, setFormData, onNext, onBack }: StepContratanteProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  function update(field: keyof FormData, value: string) {
    setFormData({ [field]: value })
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!formData.contratante_nombres) newErrors.contratante_nombres = 'Requerido'
    if (!formData.contratante_ap_paterno) newErrors.contratante_ap_paterno = 'Requerido'
    if (!formData.contratante_fecha_nac) newErrors.contratante_fecha_nac = 'Requerido'
    if (!formData.contratante_genero) newErrors.contratante_genero = 'Requerido'
    if (!formData.contratante_curp) newErrors.contratante_curp = 'Requerido'
    if (!formData.contratante_telefono) newErrors.contratante_telefono = 'Requerido'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return false
    }
    return true
  }

  function handleNext() {
    if (validate()) onNext()
  }

  const inputClass = "h-11 text-base"
  const errorClass = "text-red-500 text-xs mt-1"

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Datos del Contratante</h2>
        <p className="text-sm text-gray-500">Información del titular de la póliza</p>
      </div>

      {/* INE Upload Banner */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-blue-700 font-medium">📷 Foto del INE (opcional)</p>
          <p className="text-xs text-blue-600 mt-1">
            Puedes tomar una foto del INE para llenar los datos más rápido, o llenar manualmente.
          </p>
          <p className="text-xs text-blue-500 mt-1 italic">
            OCR automático disponible próximamente. Por ahora, llena manualmente.
          </p>
        </CardContent>
      </Card>

      {/* Datos Personales */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Datos Personales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="nombres">Nombre(s) *</Label>
            <Input
              id="nombres"
              placeholder="Nombre(s)"
              value={formData.contratante_nombres}
              onChange={(e) => update('contratante_nombres', e.target.value.toUpperCase())}
              className={inputClass}
            />
            {errors.contratante_nombres && <p className={errorClass}>{errors.contratante_nombres}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ap_pat">Apellido Paterno *</Label>
              <Input
                id="ap_pat"
                placeholder="Apellido paterno"
                value={formData.contratante_ap_paterno}
                onChange={(e) => update('contratante_ap_paterno', e.target.value.toUpperCase())}
                className={inputClass}
              />
              {errors.contratante_ap_paterno && <p className={errorClass}>{errors.contratante_ap_paterno}</p>}
            </div>
            <div>
              <Label htmlFor="ap_mat">Apellido Materno</Label>
              <Input
                id="ap_mat"
                placeholder="Apellido materno"
                value={formData.contratante_ap_materno}
                onChange={(e) => update('contratante_ap_materno', e.target.value.toUpperCase())}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="fecha_nac">Fecha Nacimiento *</Label>
              <Input
                id="fecha_nac"
                type="date"
                value={formData.contratante_fecha_nac}
                onChange={(e) => update('contratante_fecha_nac', e.target.value)}
                className={inputClass}
              />
              {errors.contratante_fecha_nac && <p className={errorClass}>{errors.contratante_fecha_nac}</p>}
            </div>
            <div>
              <Label htmlFor="genero">Género *</Label>
              <Select value={formData.contratante_genero} onValueChange={(v) => update('contratante_genero', v)}>
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Género" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                </SelectContent>
              </Select>
              {errors.contratante_genero && <p className={errorClass}>{errors.contratante_genero}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="curp">CURP *</Label>
            <Input
              id="curp"
              placeholder="CURP (18 caracteres)"
              value={formData.contratante_curp}
              onChange={(e) => update('contratante_curp', e.target.value.toUpperCase())}
              maxLength={18}
              className={`${inputClass} font-mono`}
            />
            {errors.contratante_curp && <p className={errorClass}>{errors.contratante_curp}</p>}
          </div>

          <div>
            <Label htmlFor="rfc">RFC</Label>
            <Input
              id="rfc"
              placeholder="RFC (opcional)"
              value={formData.contratante_rfc}
              onChange={(e) => update('contratante_rfc', e.target.value.toUpperCase())}
              maxLength={13}
              className={`${inputClass} font-mono`}
            />
          </div>
        </CardContent>
      </Card>

      {/* Identificación */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Identificación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="tipo_id">Tipo de ID</Label>
              <Select value={formData.contratante_tipo_id} onValueChange={(v) => update('contratante_tipo_id', v)}>
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INE">INE / IFE</SelectItem>
                  <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                  <SelectItem value="LICENCIA">Lic. Conducir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="num_id">Número de ID</Label>
              <Input
                id="num_id"
                placeholder="Número"
                value={formData.contratante_num_id}
                onChange={(e) => update('contratante_num_id', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contacto */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Contacto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="telefono">Teléfono Celular *</Label>
            <Input
              id="telefono"
              type="tel"
              inputMode="numeric"
              placeholder="10 dígitos"
              value={formData.contratante_telefono}
              onChange={(e) => update('contratante_telefono', e.target.value)}
              maxLength={10}
              className={inputClass}
            />
            {errors.contratante_telefono && <p className={errorClass}>{errors.contratante_telefono}</p>}
          </div>
          <div>
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              placeholder="correo@ejemplo.com"
              value={formData.contratante_email}
              onChange={(e) => update('contratante_email', e.target.value)}
              className={inputClass}
            />
          </div>
        </CardContent>
      </Card>

      {/* Dirección */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Dirección
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label htmlFor="calle">Calle</Label>
              <Input
                id="calle"
                placeholder="Calle"
                value={formData.contratante_calle}
                onChange={(e) => update('contratante_calle', e.target.value.toUpperCase())}
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="num_ext">Núm. Ext</Label>
              <Input
                id="num_ext"
                placeholder="Ext"
                value={formData.contratante_num_ext}
                onChange={(e) => update('contratante_num_ext', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="cp">C.P.</Label>
              <Input
                id="cp"
                inputMode="numeric"
                placeholder="Código Postal"
                value={formData.contratante_cp}
                onChange={(e) => update('contratante_cp', e.target.value)}
                maxLength={5}
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="colonia">Colonia</Label>
              <Input
                id="colonia"
                placeholder="Colonia"
                value={formData.contratante_colonia}
                onChange={(e) => update('contratante_colonia', e.target.value.toUpperCase())}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="municipio">Municipio</Label>
              <Input
                id="municipio"
                placeholder="Municipio / Alcaldía"
                value={formData.contratante_municipio}
                onChange={(e) => update('contratante_municipio', e.target.value.toUpperCase())}
                className={inputClass}
              />
            </div>
            <div>
              <Label htmlFor="estado">Estado</Label>
              <Select value={formData.contratante_estado} onValueChange={(v) => update('contratante_estado', v)}>
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_MX.map(e => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ocupación */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Ocupación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Ocupación / Puesto"
            value={formData.contratante_ocupacion}
            onChange={(e) => update('contratante_ocupacion', e.target.value.toUpperCase())}
            className={inputClass}
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12">
          ← Atrás
        </Button>
        <Button onClick={handleNext} className="flex-1 h-12 bg-[#003087] hover:bg-[#002070]">
          Continuar →
        </Button>
      </div>
    </div>
  )
}
