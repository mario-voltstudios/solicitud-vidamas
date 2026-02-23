'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { submitSolicitud } from '@/app/solicitud/actions'
import { FormData } from '@/lib/types'

interface StepReviewProps {
  formData: FormData
  onBack: () => void
  onGoToStep: (step: number) => void
}

function DataRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 flex-shrink-0 mr-2">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right break-all">{value}</span>
    </div>
  )
}

function Section({ title, step, children, onEdit }: { title: string; step: number; children: React.ReactNode; onEdit: (step: number) => void }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            {title}
          </CardTitle>
          <button
            onClick={() => onEdit(step)}
            className="text-xs text-[#003087] underline"
          >
            Editar
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

export default function StepReview({ formData, onBack, onGoToStep }: StepReviewProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedFolio, setSubmittedFolio] = useState('')
  const [error, setError] = useState('')
  const [hasSignature, setHasSignature] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#003087'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    // Set canvas size
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    ctx.strokeStyle = '#003087'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    isDrawing.current = true
    const pos = getPos(e, canvas)
    lastPos.current = pos
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setHasSignature(true)
  }

  function stopDraw() {
    isDrawing.current = false
  }

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  async function handleSubmit() {
    if (!hasSignature) {
      setError('Por favor firma antes de enviar')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // Get signature as base64
      const canvas = canvasRef.current
      const signatureData = canvas ? canvas.toDataURL('image/png') : undefined

      const result = await submitSolicitud({
        ...formData,
        firma_base64: signatureData,
      })

      if (!result.success) {
        setError(result.error || 'Error al guardar. Intenta de nuevo.')
        return
      }

      setSubmittedFolio(result.folio || formData.folio)
      setSubmitted(true)
    } catch (err) {
      setError('Error de conexión. Verifica tu señal e intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
            <span className="text-white text-4xl">✓</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-green-600">¡Solicitud Enviada!</h2>
            <p className="text-gray-600 mt-1">La solicitud fue guardada exitosamente</p>
          </div>
        </div>

        <Card className="bg-[#003087] text-white">
          <CardContent className="pt-6 pb-6">
            <p className="text-sm opacity-75 mb-2">Número de Folio</p>
            <p className="text-2xl font-mono font-bold">{submittedFolio}</p>
            <p className="text-sm opacity-75 mt-2">Guarda este folio para seguimiento</p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            El equipo de operaciones revisará la solicitud y te notificará del estado.
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="w-full h-12 bg-[#003087] hover:bg-[#002070]"
          >
            Nueva Solicitud
          </Button>
        </div>
      </div>
    )
  }

  const totalPrima = (parseFloat(formData.prima_base || '0') + parseFloat(formData.prima_adicional || '0')).toFixed(2)

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Revisión Final</h2>
        <p className="text-sm text-gray-500">Verifica los datos antes de enviar</p>
      </div>

      {/* Folio */}
      <div className="bg-[#003087] text-white rounded-xl p-4 text-center">
        <p className="text-xs opacity-75">Folio</p>
        <p className="text-xl font-mono font-bold">{formData.folio}</p>
        <p className="text-xs opacity-75 mt-1">Agente: {formData.nombre_agente}</p>
      </div>

      {/* Contratante */}
      <Section title="Contratante" step={2} onEdit={onGoToStep}>
        <DataRow label="Nombre" value={`${formData.contratante_nombres} ${formData.contratante_ap_paterno} ${formData.contratante_ap_materno}`} />
        <DataRow label="Fecha Nac." value={formData.contratante_fecha_nac} />
        <DataRow label="Género" value={formData.contratante_genero === 'M' ? 'Masculino' : formData.contratante_genero === 'F' ? 'Femenino' : formData.contratante_genero} />
        <DataRow label="CURP" value={formData.contratante_curp} />
        <DataRow label="RFC" value={formData.contratante_rfc} />
        <DataRow label="Teléfono" value={formData.contratante_telefono} />
        <DataRow label="Email" value={formData.contratante_email} />
        <DataRow label="Dirección" value={[formData.contratante_calle, formData.contratante_num_ext, formData.contratante_colonia, formData.contratante_municipio, formData.contratante_estado].filter(Boolean).join(', ')} />
        <DataRow label="Nexos delincuencia" value={formData.nexos_delincuencia === 'no' ? '✅ No' : '❌ Sí'} />
      </Section>

      {/* Cobro */}
      <Section title="Forma de Cobro" step={3} onEdit={onGoToStep}>
        <DataRow label="Tipo" value={formData.forma_cobro === 'nomina' ? 'Descuento por Nómina' : 'CLABE / Tarjeta'} />
        {formData.forma_cobro === 'nomina' && <>
          <DataRow label="Dependencia" value={formData.contratante_dependencia} />
          <DataRow label="Matrícula" value={formData.matricula} />
          <DataRow label="Sub-dep." value={formData.sub_dependencia} />
          <DataRow label="Clave Deleg." value={formData.clave_delegacional} />
        </>}
        {formData.forma_cobro === 'clabe' && <>
          <DataRow label="CLABE" value={formData.clabe} />
          <DataRow label="Banco" value={formData.banco} />
          <DataRow label="Inicio cobro" value={formData.fecha_inicio_cobro} />
        </>}
      </Section>

      {/* Asegurado */}
      <Section title="Asegurado" step={4} onEdit={onGoToStep}>
        {formData.misma_persona ? (
          <p className="text-xs text-gray-600">Misma persona que el contratante</p>
        ) : <>
          <DataRow label="Nombre" value={`${formData.asegurado_nombres} ${formData.asegurado_ap_paterno} ${formData.asegurado_ap_materno}`} />
          <DataRow label="Fecha Nac." value={formData.asegurado_fecha_nac} />
          <DataRow label="RFC" value={formData.asegurado_rfc} />
        </>}
      </Section>

      {/* Plan */}
      <Section title="Plan" step={5} onEdit={onGoToStep}>
        <DataRow label="Producto" value="Vida Más Constante" />
        <DataRow label="Plan" value={formData.plan} />
        <DataRow label="Periodicidad" value={formData.periodicidad} />
        <DataRow label="Prima base" value={formData.prima_base ? `$${parseFloat(formData.prima_base).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : undefined} />
        {formData.prima_adicional && parseFloat(formData.prima_adicional) > 0 && (
          <DataRow label="Prima adic." value={`$${parseFloat(formData.prima_adicional).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`} />
        )}
        <DataRow label="Prima total" value={`$${parseFloat(totalPrima).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`} />
        <DataRow label="Suma aseg." value={formData.suma_asegurada ? `$${parseFloat(formData.suma_asegurada).toLocaleString('es-MX')}` : undefined} />
      </Section>

      {/* Beneficiarios */}
      <Section title="Beneficiarios" step={6} onEdit={onGoToStep}>
        {formData.beneficiarios?.map((b, i) => (
          <div key={b.id} className="py-1.5 border-b border-gray-100 last:border-0">
            <p className="text-xs font-medium text-gray-800">
              {i + 1}. {b.nombres} {b.ap_paterno} {b.ap_materno}
            </p>
            <p className="text-xs text-gray-500">
              {b.parentesco} • {b.porcentaje}%
            </p>
          </div>
        ))}
      </Section>

      {/* Signature */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Firma del Agente
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-gray-500 mb-2">
            Firma en el recuadro para confirmar la solicitud
          </p>
          <div className="relative rounded-xl border-2 border-dashed border-[#003087] bg-gray-50" style={{ height: 140 }}>
            <canvas
              ref={canvasRef}
              className="w-full h-full rounded-xl cursor-crosshair touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            {!hasSignature && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-300 pointer-events-none select-none">
                Firma aquí
              </p>
            )}
          </div>
          {hasSignature && (
            <button
              onClick={clearSignature}
              className="text-xs text-gray-400 underline mt-1"
            >
              Borrar firma
            </button>
          )}
          {error && error.includes('firma') && (
            <p className="text-red-500 text-xs mt-1">{error}</p>
          )}
        </CardContent>
      </Card>

      {error && !error.includes('firma') && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-red-600 text-sm">⚠️ {error}</p>
          <p className="text-xs text-red-500 mt-1">
            Si el problema persiste, guarda el folio {formData.folio} y contacta a soporte.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12">
          ← Atrás
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Enviando...
            </span>
          ) : (
            '✓ Enviar Solicitud'
          )}
        </Button>
      </div>
    </div>
  )
}
