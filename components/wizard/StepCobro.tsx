'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormData, DEPENDENCIAS } from '@/lib/types'
import { getDependenciaRequirements } from '@/lib/dependencia-rules'
import { matchFoliosByDependencia } from '@/lib/release-folder-rules'

interface StepCobroProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

const BANCOS = [
  'BBVA Bancomer', 'Banorte', 'Santander', 'HSBC', 'Citibanamex',
  'Scotiabank', 'Inbursa', 'BanBajío', 'Afirme', 'Banca Mifel',
  'Banco Azteca', 'Banregio', 'Hey Banco', 'Nu México', 'Otro',
]

export default function StepCobro({ formData, setFormData, onNext, onBack }: StepCobroProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  function update(field: keyof FormData, value: string) {
    setFormData({ [field]: value })
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  function setFormaCobro(tipo: 'nomina' | 'clabe') {
    if (tipo === 'clabe') {
      // Clear nómina-specific fields when switching to CLABE
      setFormData({
        forma_cobro: tipo,
        contratante_dependencia: '',
        matricula: '',
        sub_dependencia: '',
        clave_delegacional: '',
        folio_contrato: '',
      })
    } else {
      // Clear CLABE-specific fields when switching to nómina
      setFormData({
        forma_cobro: tipo,
        clabe: '',
        banco: '',
        fecha_inicio_cobro: '',
      })
    }
    setErrors({})
  }

  function validate() {
    const newErrors: Record<string, string> = {}
    if (!formData.forma_cobro) {
      newErrors.forma_cobro = 'Selecciona una forma de cobro'
    }
    if (formData.forma_cobro === 'nomina') {
      if (!formData.contratante_dependencia) newErrors.contratante_dependencia = 'Requerido'
      if (!formData.matricula) newErrors.matricula = 'Requerido'
      if (formData.contratante_dependencia && formData.contratante_dependencia.toUpperCase().includes('IMSS') && !formData.imss_tipo) {
        newErrors.imss_tipo = 'Selecciona si el asegurado es activo o jubilado'
      }
    }
    if (formData.forma_cobro === 'clabe') {
      if (!formData.clabe) newErrors.clabe = 'Requerido'
      else if (formData.clabe.length !== 18) newErrors.clabe = 'La CLABE debe tener 18 dígitos'
      if (!formData.banco) newErrors.banco = 'Requerido'
      if (!formData.fecha_inicio_cobro) newErrors.fecha_inicio_cobro = 'Requerido'
    }
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
  const dependenciaRequirements = getDependenciaRequirements(formData)
  const folioCandidates = matchFoliosByDependencia(formData.contratante_dependencia)

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Forma de Cobro</h2>
        <p className="text-sm text-gray-500">¿Cómo se realizará el descuento?</p>
      </div>

      {/* Tipo de cobro selector */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setFormaCobro('nomina')}
          className={`
            p-4 rounded-xl border-2 text-left transition-all
            ${formData.forma_cobro === 'nomina'
              ? 'border-[#003087] bg-blue-50'
              : 'border-gray-200 bg-white'}
          `}
        >
          <div className="text-2xl mb-2">🏛️</div>
          <div className="font-semibold text-sm text-gray-800">Descuento por Nómina</div>
          <div className="text-xs text-gray-500 mt-1">IMSS, ISSSTE, Gobierno, etc.</div>
        </button>

        <button
          onClick={() => setFormaCobro('clabe')}
          className={`
            p-4 rounded-xl border-2 text-left transition-all
            ${formData.forma_cobro === 'clabe'
              ? 'border-[#003087] bg-blue-50'
              : 'border-gray-200 bg-white'}
          `}
        >
          <div className="text-2xl mb-2">💳</div>
          <div className="font-semibold text-sm text-gray-800">CLABE / Tarjeta</div>
          <div className="text-xs text-gray-500 mt-1">Banco o tarjeta de débito</div>
        </button>
      </div>
      {errors.forma_cobro && <p className={errorClass}>{errors.forma_cobro}</p>}

      {/* Nómina fields */}
      {formData.forma_cobro === 'nomina' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              Datos de Nómina
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Dependencia / Institución *</Label>
              <Select
                value={formData.contratante_dependencia}
                onValueChange={(v) => update('contratante_dependencia', v)}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Selecciona la dependencia" />
                </SelectTrigger>
                <SelectContent>
                  {DEPENDENCIAS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.contratante_dependencia && <p className={errorClass}>{errors.contratante_dependencia}</p>}
            </div>

            <div>
              <Label>Matrícula / Número de Empleado *</Label>
              <Input
                placeholder="Matrícula"
                value={formData.matricula}
                onChange={(e) => update('matricula', e.target.value)}
                className={inputClass}
              />
              {errors.matricula && <p className={errorClass}>{errors.matricula}</p>}
            </div>

            <div>
              <Label>Sub-dependencia</Label>
              <Input
                placeholder="Sub-dependencia (si aplica)"
                value={formData.sub_dependencia}
                onChange={(e) => update('sub_dependencia', e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <Label>Clave Delegacional</Label>
              <Input
                placeholder="Clave delegacional"
                value={formData.clave_delegacional}
                onChange={(e) => update('clave_delegacional', e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <Label>Folio de Contrato / Folio GNP</Label>
              <Input
                placeholder="Folio de contrato GNP"
                value={formData.folio_contrato}
                onChange={(e) => update('folio_contrato', e.target.value)}
                className={inputClass}
              />
              {folioCandidates.length > 0 && (
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-900">Sugerencia desde carpetas de liberación</p>
                  <p className="text-xs text-blue-800 mt-1">
                    Folio(s) candidato(s): {folioCandidates.flatMap((item) => item.folios).join(', ')}
                  </p>
                  <p className="text-[11px] text-blue-700 mt-1">
                    Úsalo como guía inicial. La versión final debe amarrarse al talón/OCR y a la regla exacta de subdependencia.
                  </p>
                </div>
              )}
            </div>

            {/* IMSS Activo / Jubilado selector */}
            {formData.contratante_dependencia && formData.contratante_dependencia.toUpperCase().includes('IMSS') && (
              <div>
                <Label className="text-base font-medium">¿El asegurado es trabajador activo o jubilado? *</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      update('imss_tipo', 'ACTIVO')
                      // Update dependencia to remove JUBILADO if present
                      if (formData.contratante_dependencia.toUpperCase().includes('JUBILADO')) {
                        setFormData({
                          imss_tipo: 'ACTIVO',
                          contratante_dependencia: formData.contratante_dependencia.replace(/[\s-]*JUBILAD[OA]S?/gi, '').trim(),
                        })
                      }
                    }}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      formData.imss_tipo === 'ACTIVO'
                        ? 'border-[#003087] bg-blue-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="text-lg mb-1">👷</div>
                    <div className="font-semibold text-sm">Activo</div>
                    <div className="text-xs text-gray-500">Trabajador en activo</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      update('imss_tipo', 'JUBILADO')
                      // Update dependencia to include JUBILADO
                      if (!formData.contratante_dependencia.toUpperCase().includes('JUBILADO')) {
                        setFormData({
                          imss_tipo: 'JUBILADO',
                          contratante_dependencia: formData.contratante_dependencia + ' Jubilados',
                        })
                      }
                    }}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      formData.imss_tipo === 'JUBILADO'
                        ? 'border-[#003087] bg-blue-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="text-lg mb-1">👴</div>
                    <div className="font-semibold text-sm">Jubilado</div>
                    <div className="text-xs text-gray-500">Pensionado / jubilado</div>
                  </button>
                </div>
                {errors.imss_tipo && <p className={errorClass}>{errors.imss_tipo}</p>}

                {formData.imss_tipo === 'JUBILADO' && (
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-900">ℹ️ Para IMSS Jubilados se requiere carta de instrucción adicional</p>
                  </div>
                )}
              </div>
            )}

            {/* Docs needed for nómina */}
            {formData.contratante_dependencia && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-medium text-amber-800 mb-2">📋 Documentos para este caso</p>
                <ul className="text-xs text-amber-700 space-y-1">
                  {dependenciaRequirements.map((doc) => (
                    <li key={doc.key}>
                      • {doc.title}{doc.required ? '' : ' (seguimiento si falta)'}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-700 mt-2">
                  Solo pedimos lo esencial. Si falta algo no crítico, la solicitud puede seguir como pendiente de documentos.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* CLABE fields */}
      {formData.forma_cobro === 'clabe' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              Datos Bancarios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>CLABE Interbancaria *</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="18 dígitos"
                value={formData.clabe}
                onChange={(e) => update('clabe', e.target.value.replace(/\D/g, ''))}
                maxLength={18}
                className={`${inputClass} font-mono tracking-widest`}
              />
              <p className="text-xs text-gray-400 mt-1">
                {formData.clabe.length}/18 dígitos
              </p>
              {errors.clabe && <p className={errorClass}>{errors.clabe}</p>}
            </div>

            <div>
              <Label>Banco *</Label>
              <Select value={formData.banco} onValueChange={(v) => update('banco', v)}>
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Selecciona el banco" />
                </SelectTrigger>
                <SelectContent>
                  {BANCOS.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.banco && <p className={errorClass}>{errors.banco}</p>}
            </div>

            <div>
              <Label>Fecha de Inicio de Cobro *</Label>
              <Input
                type="date"
                value={formData.fecha_inicio_cobro}
                onChange={(e) => update('fecha_inicio_cobro', e.target.value)}
                className={inputClass}
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.fecha_inicio_cobro && <p className={errorClass}>{errors.fecha_inicio_cobro}</p>}
            </div>
          </CardContent>
        </Card>
      )}

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
