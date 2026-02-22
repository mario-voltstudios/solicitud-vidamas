'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormData, ESTADOS_MX } from '@/lib/types'
import { extractINEData } from '@/app/solicitud/actions'
import imageCompression from 'browser-image-compression'

interface StepContratanteProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepContratante({ formData, setFormData, onNext, onBack }: StepContratanteProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [ocrState, setOcrState] = useState<'idle' | 'compressing' | 'extracting' | 'done' | 'error'>('idle')
  const [ocrError, setOcrError] = useState<string>('')
  const [inePreview, setInePreview] = useState<string>('')
  const ineInputRef = useRef<HTMLInputElement>(null)

  async function handleINEUpload(file: File) {
    setOcrState('compressing')
    setOcrError('')
    try {
      // Compress image
      const compressed = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.8,
      })
      
      // Show preview
      const previewUrl = URL.createObjectURL(compressed)
      setInePreview(previewUrl)
      
      // Convert to base64 for server action
      const buffer = await compressed.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      
      setOcrState('extracting')
      const result = await extractINEData(base64, 'image/jpeg')
      
      if (!result.success || !result.data) {
        setOcrError(result.error || 'Error al leer el INE')
        setOcrState('error')
        return
      }

      const d = result.data
      setFormData({
        contratante_nombres: d.nombres || '',
        contratante_ap_paterno: d.apellido_paterno || '',
        contratante_ap_materno: d.apellido_materno || '',
        contratante_fecha_nac: d.fecha_nacimiento || '',
        contratante_genero: d.sexo || '',
        contratante_curp: d.curp || '',
        contratante_num_id: d.clave_elector || '',
        contratante_tipo_id: 'INE',
        contratante_calle: d.domicilio?.calle || '',
        contratante_num_ext: d.domicilio?.numero || '',
        contratante_colonia: d.domicilio?.colonia || '',
        contratante_cp: d.domicilio?.cp || '',
        contratante_municipio: d.domicilio?.municipio || '',
        contratante_estado: d.domicilio?.estado || '',
      })
      setOcrState('done')
    } catch (err) {
      console.error('INE upload error:', err)
      setOcrError('Error procesando imagen. Intenta de nuevo.')
      setOcrState('error')
    }
  }

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
    if (!formData.contratante_rfc) newErrors.contratante_rfc = 'Requerido'
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

      {/* INE OCR Upload */}
      <Card className={
        ocrState === 'done' ? 'bg-green-50 border-green-200' :
        ocrState === 'error' ? 'bg-red-50 border-red-200' :
        'bg-blue-50 border-blue-200'
      }>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#003087]">
                📷 Escanear INE con IA
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Sube o toma foto del frente del INE y llenamos los datos automáticamente
              </p>

              {ocrState === 'compressing' && (
                <div className="flex items-center gap-2 mt-2">
                  <svg className="animate-spin h-4 w-4 text-blue-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-xs text-blue-700">Comprimiendo imagen...</span>
                </div>
              )}

              {ocrState === 'extracting' && (
                <div className="flex items-center gap-2 mt-2">
                  <svg className="animate-spin h-4 w-4 text-blue-600" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-xs text-blue-700">Leyendo datos con IA...</span>
                </div>
              )}

              {ocrState === 'done' && (
                <p className="text-xs text-green-700 mt-1 font-medium">
                  ✓ Datos extraídos. Revisa y corrige si es necesario.
                </p>
              )}

              {ocrState === 'error' && (
                <p className="text-xs text-red-600 mt-1">{ocrError}</p>
              )}
            </div>

            <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
              {inePreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={inePreview} alt="INE" className="w-16 h-10 object-cover rounded border" />
                  <div className="flex gap-2 mt-1">
                    <label
                      htmlFor="ine-ocr-camera"
                      className="text-xs text-blue-600 underline cursor-pointer"
                    >
                      📷
                    </label>
                    <label
                      htmlFor="ine-ocr-gallery"
                      className="text-xs text-blue-600 underline cursor-pointer"
                    >
                      📁
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <label
                    htmlFor="ine-ocr-camera"
                    className={`
                      flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 cursor-pointer
                      ${ocrState === 'compressing' || ocrState === 'extracting'
                        ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
                        : 'border-[#003087] bg-white hover:bg-blue-50 active:bg-blue-100'}
                    `}
                  >
                    {ocrState === 'compressing' || ocrState === 'extracting' ? (
                      <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <>
                        <span className="text-xl">📷</span>
                        <span className="text-[10px] text-gray-500">Cámara</span>
                      </>
                    )}
                  </label>
                  <label
                    htmlFor="ine-ocr-gallery"
                    className={`
                      flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 cursor-pointer
                      ${ocrState === 'compressing' || ocrState === 'extracting'
                        ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
                        : 'border-[#003087] bg-white hover:bg-blue-50 active:bg-blue-100'}
                    `}
                  >
                    {ocrState === 'compressing' || ocrState === 'extracting' ? (
                      <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <>
                        <span className="text-xl">📁</span>
                        <span className="text-[10px] text-gray-500">Galería</span>
                      </>
                    )}
                  </label>
                </div>
              )}
              {/* Camera input — opens camera directly on mobile */}
              <input
                id="ine-ocr-camera"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={ocrState === 'compressing' || ocrState === 'extracting'}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleINEUpload(file)
                  e.target.value = ''
                }}
              />
              {/* Gallery/files input — opens photo library or file picker */}
              <input
                ref={ineInputRef}
                id="ine-ocr-gallery"
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                disabled={ocrState === 'compressing' || ocrState === 'extracting'}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleINEUpload(file)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
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
            <Label htmlFor="curp">CURP</Label>
            <Input
              id="curp"
              placeholder="CURP (opcional, 18 caracteres)"
              value={formData.contratante_curp}
              onChange={(e) => update('contratante_curp', e.target.value.toUpperCase())}
              maxLength={18}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <Label htmlFor="rfc">RFC *</Label>
            <Input
              id="rfc"
              placeholder="RFC del contratante"
              value={formData.contratante_rfc}
              onChange={(e) => update('contratante_rfc', e.target.value.toUpperCase())}
              maxLength={13}
              className={`${inputClass} font-mono`}
            />
            {errors.contratante_rfc && <p className={errorClass}>{errors.contratante_rfc}</p>}
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
