'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { FormData } from '@/lib/types'
import imageCompression from 'browser-image-compression'
import { DocRequirement, getDependenciaRequirements, getMissingRequiredDocs } from '@/lib/dependencia-rules'
import { buildTalonPrefillPatch, buildINEPrefillPatch, isFieldFromOCR } from '@/lib/ocr/prefill'

interface StepDocumentosProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

type OCRStatus = 'pending' | 'extracting' | 'success' | 'review-needed' | 'error' | 'manual'

type OCRDocumentType = 'talon' | 'ine'

interface OCRState {
  status: OCRStatus
  type: OCRDocumentType
  summary?: Array<{ label: string; value: string }>
  warnings?: string[]
  error?: string
}

interface DocUploadState {
  status: 'idle' | 'compressing' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  previewUrl?: string
  signedUrl?: string
  filename?: string
  isVideo?: boolean
  ocr?: OCRState
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

const CATEGORY_LABELS: Record<DocRequirement['category'], string> = {
  identity: 'Identificación',
  payroll: 'Nómina',
  supporting: 'Soportes Adicionales',
  signature: 'Páginas Firmadas',
  verification: 'Verificación',
}

async function getSignedUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/solicitud-docs/${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 3600 }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null
  } catch {
    return null
  }
}

async function uploadWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (pct: number) => void
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status }))
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(body)
  })
}

function groupByCategory(requirements: DocRequirement[]) {
  return requirements.reduce<Record<string, DocRequirement[]>>((acc, req) => {
    if (!acc[req.category]) acc[req.category] = []
    acc[req.category].push(req)
    return acc
  }, {})
}

function getOCRDocumentType(key: string): OCRDocumentType | null {
  if (key === 'talon') return 'talon'
  if (key === 'ine_frente' || key === 'ine_reverso') return 'ine'
  return null
}

function formatOCRValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  return null
}

function buildOCRSummary(type: OCRDocumentType, extracted: Record<string, unknown>): Array<{ label: string; value: string }> {
  const fields = type === 'talon'
    ? [
        ['Dependencia', 'institucion'],
        ['Matrícula', 'matricula'],
        ['RFC', 'rfc'],
        ['Concepto', 'concepto_descuento'],
        ['Líquido', 'liquido_a_cobrar'],
      ]
    : [
        ['Nombre', 'nombre_completo'],
        ['CURP', 'curp'],
        ['Clave elector', 'clave_elector'],
        ['Dirección', 'direccion'],
      ]

  return fields.flatMap(([label, key]) => {
    const value = formatOCRValue(extracted[key])
    return value ? [{ label, value }] : []
  }).slice(0, 5)
}

function collectOCRWarnings(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []
  const payload = data as {
    warnings?: unknown
    validation?: { errors?: unknown; warnings?: unknown; isValid?: boolean }
  }
  const warnings = [
    ...(Array.isArray(payload.warnings) ? payload.warnings : []),
    ...(Array.isArray(payload.validation?.warnings) ? payload.validation.warnings : []),
    ...(Array.isArray(payload.validation?.errors) ? payload.validation.errors : []),
  ]
  return warnings.map(String).filter(Boolean).slice(0, 4)
}

function getOCRStatusLabel(status: OCRStatus) {
  switch (status) {
    case 'pending': return 'OCR pendiente'
    case 'extracting': return 'Extrayendo datos...'
    case 'success': return 'OCR listo'
    case 'review-needed': return 'Revisar datos OCR'
    case 'error': return 'OCR con error'
    case 'manual': return 'Captura manual disponible'
  }
}

function getOCRStatusClass(status: OCRStatus) {
  switch (status) {
    case 'success': return 'border-green-200 bg-green-50 text-green-800'
    case 'review-needed': return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'error': return 'border-red-200 bg-red-50 text-red-800'
    case 'extracting': return 'border-blue-200 bg-blue-50 text-blue-800'
    default: return 'border-gray-200 bg-gray-50 text-gray-700'
  }
}

export default function StepDocumentos({ formData, setFormData, onNext, onBack }: StepDocumentosProps) {
  const [uploadStates, setUploadStates] = useState<Record<string, DocUploadState>>({})

  const requirements = useMemo(() => getDependenciaRequirements(formData), [formData])
  const groupedRequirements = useMemo(() => groupByCategory(requirements), [requirements])
  const missingRequiredDocs = useMemo(() => getMissingRequiredDocs(formData), [formData])

  function setState(key: string, patch: Partial<DocUploadState>) {
    setUploadStates(prev => ({
      ...prev,
      [key]: { ...{ status: 'idle', progress: 0 }, ...prev[key], ...patch },
    }))
  }

  async function runOCR(key: string, type: OCRDocumentType, imageUrl: string) {
    setState(key, { ocr: { status: 'extracting', type } })

    try {
      const response = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, imageUrl }),
      })
      const payload = await response.json()

      if (!response.ok || !payload.success) {
        setState(key, {
          ocr: {
            status: 'error',
            type,
            error: payload.error || 'No se pudo extraer OCR. Puedes continuar manualmente.',
          },
        })
        return
      }

      const extracted = (payload.data?.extracted || {}) as Record<string, unknown>
      const warnings = collectOCRWarnings(payload.data)
      const summary = buildOCRSummary(type, extracted)
      const isValid = payload.data?.validation?.isValid !== false

      setState(key, {
        ocr: {
          status: isValid && warnings.length === 0 && summary.length > 0 ? 'success' : 'review-needed',
          type,
          summary,
          warnings,
        },
      })

      // Pre-fill form fields from OCR extraction
      if (summary.length > 0) {
        const prefillPatch = type === 'talon'
          ? buildTalonPrefillPatch(extracted as unknown as Parameters<typeof buildTalonPrefillPatch>[0])
          : buildINEPrefillPatch(extracted as unknown as Parameters<typeof buildINEPrefillPatch>[0])
        // Merge: accumulate sourced fields across multiple OCR runs
        const existing = (formData as unknown as Record<string, unknown>).ocr_sourced_fields
        const newSourced = (prefillPatch as unknown as Record<string, unknown>).ocr_sourced_fields as string[] | undefined
        if (Array.isArray(newSourced)) {
          const merged = [...new Set([...(Array.isArray(existing) ? existing : []), ...newSourced])]
          ;(prefillPatch as Record<string, unknown>).ocr_sourced_fields = merged
        }
        setFormData(prefillPatch as Partial<FormData>)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo extraer OCR'
      setState(key, {
        ocr: {
          status: 'error',
          type,
          error: `${msg}. Puedes continuar con captura manual.`,
        },
      })
    }
  }

  async function handleFileUpload(key: string, file: File, attempt = 1) {
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    const ocrType = getOCRDocumentType(key)

    setState(key, {
      status: 'compressing',
      progress: 0,
      error: undefined,
      isVideo,
      ocr: ocrType ? { status: 'pending', type: ocrType } : undefined,
    })

    try {
      let uploadFile: File | Blob = file

      if (isImage) {
        uploadFile = await imageCompression(file, {
          maxSizeMB: 1.5,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
          fileType: 'image/jpeg',
          initialQuality: 0.82,
        })
      }

      setState(key, { status: 'uploading', progress: 5 })

      const ext = isImage ? 'jpg' : (file.name.split('.').pop() || 'bin')
      const filename = `${formData.folio}/${key}-${Date.now()}.${ext}`
      const contentType = isImage ? 'image/jpeg' : file.type

      const response = await uploadWithProgress(
        `${SUPABASE_URL}/storage/v1/object/solicitud-docs/${filename}`,
        {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        uploadFile,
        (pct) => setState(key, { progress: 5 + Math.round(pct * 0.85) })
      )

      if (!response.ok) {
        const err = JSON.parse(await response.text())
        throw new Error(err.message || 'Error al subir archivo')
      }

      setState(key, { progress: 95 })
      const signedUrl = await getSignedUrl(filename)
      const previewUrl = URL.createObjectURL(isImage ? uploadFile : file)

      setState(key, {
        status: 'done',
        progress: 100,
        previewUrl,
        signedUrl: signedUrl || undefined,
        filename,
      })

      setFormData({ [`docs_${key}`]: filename } as Partial<FormData>)

      if (ocrType && signedUrl) {
        void runOCR(key, ocrType, signedUrl)
      } else if (ocrType) {
        setState(key, {
          ocr: {
            status: 'manual',
            type: ocrType,
            error: 'No se pudo generar URL para OCR. Puedes continuar con captura manual.',
          },
        })
      }
    } catch (err: unknown) {
      if (attempt < 3) {
        setState(key, { status: 'uploading', progress: 0, error: `Reintentando... (${attempt}/3)` })
        setTimeout(() => handleFileUpload(key, file, attempt + 1), 1200)
        return
      }
      const msg = err instanceof Error ? err.message : 'Error al subir, intenta de nuevo'
      setState(key, { status: 'error', progress: 0, error: msg })
    }
  }

  function DocUploadCard({ requirement }: { requirement: DocRequirement }) {
    const s = uploadStates[requirement.key] || { status: 'idle', progress: 0 }
    const isDone = s.status === 'done'
    const isBusy = s.status === 'compressing' || s.status === 'uploading'
    const isVideo = requirement.key === 'video'

    return (
      <Card className={isDone ? 'border-green-200 bg-green-50' : s.status === 'error' ? 'border-red-200' : ''}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-800 truncate">
                {requirement.title} {requirement.required && <span className="text-red-500">*</span>}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{requirement.description}</p>
              {requirement.reason && (
                <p className="text-[11px] text-amber-700 mt-1">{requirement.reason}</p>
              )}

              {isBusy && (
                <div className="mt-2">
                  <Progress value={s.progress} className="h-1.5" />
                  <p className="text-xs text-blue-600 mt-1">
                    {s.status === 'compressing' ? 'Comprimiendo...' : `Subiendo... ${s.progress}%`}
                  </p>
                </div>
              )}

              {s.error && <p className="text-red-500 text-xs mt-1">{s.error}</p>}

              {s.ocr && (
                <div className={`mt-2 rounded-lg border p-2 text-xs ${getOCRStatusClass(s.ocr.status)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{getOCRStatusLabel(s.ocr.status)}</span>
                    {s.ocr.status === 'extracting' && (
                      <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
                    )}
                  </div>

                  {s.ocr.summary && s.ocr.summary.length > 0 && (
                    <dl className="mt-2 grid grid-cols-1 gap-1">
                      {s.ocr.summary.map((item) => (
                        <div key={item.label} className="flex gap-2">
                          <dt className="font-medium min-w-[82px]">{item.label}:</dt>
                          <dd className="truncate">
                            <span className="text-blue-600">✦</span> {item.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {s.ocr.warnings && s.ocr.warnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-4 space-y-0.5">
                      {s.ocr.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}

                  {s.ocr.error && <p className="mt-1">{s.ocr.error}</p>}
                  {['review-needed', 'error', 'manual'].includes(s.ocr.status) && (
                    <p className="mt-1 font-medium">No bloquea el envío; revisa o captura los datos manualmente.</p>
                  )}
                </div>
              )}

              {isDone && s.previewUrl && !isVideo && (
                <div className="mt-2">
                  <a href={s.signedUrl || s.previewUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.previewUrl}
                      alt={requirement.title}
                      className="h-16 w-auto max-w-[120px] object-cover rounded border hover:opacity-80 transition"
                    />
                  </a>
                  <p className="text-xs text-green-700 mt-1">✓ Subido correctamente</p>
                </div>
              )}

              {isDone && isVideo && (
                <div className="mt-2">
                  <video src={s.signedUrl || s.previewUrl} controls className="h-20 w-full max-w-[200px] rounded border bg-black" />
                  <p className="text-xs text-green-700 mt-1">✓ Video subido</p>
                </div>
              )}
            </div>

            <div className="flex-shrink-0">
              {isDone ? (
                <div className="text-center">
                  <span className="text-green-500 text-xl block">✓</span>
                  <label htmlFor={`file-${requirement.key}`} className="cursor-pointer text-xs text-blue-600 underline block">
                    Cambiar
                  </label>
                </div>
              ) : (
                <label
                  htmlFor={`file-${requirement.key}`}
                  className={`flex items-center justify-center w-12 h-12 rounded-xl border-2 cursor-pointer ${isBusy ? 'border-gray-200 bg-gray-100 cursor-not-allowed' : 'border-[#003087] bg-blue-50 hover:bg-blue-100 active:bg-blue-200'}`}
                >
                  {isBusy ? (
                    <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <span className="text-2xl">{isVideo ? '🎥' : '📷'}</span>
                  )}
                </label>
              )}
              <input
                id={`file-${requirement.key}`}
                type="file"
                accept={isVideo ? 'video/*' : 'image/*,.pdf'}
                capture={isVideo ? 'environment' : 'environment'}
                className="hidden"
                disabled={isBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(requirement.key, file)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const uploadedCount = requirements.filter((req) => uploadStates[req.key]?.status === 'done').length
  const requiredCount = requirements.filter((req) => req.required).length

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Documentos</h2>
        <p className="text-sm text-gray-500">Sube solo lo esencial. Si falta algo, la solicitud sigue entrando y queda en seguimiento.</p>
      </div>

      <div className="bg-gray-100 rounded-xl p-3 text-center space-y-1">
        <p className="text-sm text-gray-600">
          Documentos subidos: <span className="font-bold text-[#003087]">{uploadedCount}</span>
        </p>
        <p className="text-xs text-gray-500">{requiredCount} requeridos en esta dependencia / caso</p>
      </div>

      {missingRequiredDocs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm font-medium text-amber-900">Faltan documentos requeridos</p>
          <ul className="text-xs text-amber-800 mt-2 space-y-1 list-disc pl-4">
            {missingRequiredDocs.map((doc) => (
              <li key={doc.key}>{doc.title}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-2">
            Puedes continuar de todos modos. La solicitud se guardará como <strong>pendiente_docs</strong> para seguimiento.
          </p>
        </div>
      )}

      {Object.entries(groupedRequirements).map(([category, docs]) => (
        <Card key={category}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              {CATEGORY_LABELS[category as DocRequirement['category']]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {docs.map((requirement) => (
              <DocUploadCard key={requirement.key} requirement={requirement} />
            ))}
          </CardContent>
        </Card>
      ))}

      {/* OCR Pre-fill Summary — shows which form fields were auto-populated */}
      {(() => {
        const sourcedFields = (formData as unknown as Record<string, unknown>).ocr_sourced_fields as string[] | undefined
        if (!Array.isArray(sourcedFields) || sourcedFields.length === 0) return null

        const FIELD_LABELS: Record<string, string> = {
          contratante_dependencia: 'Dependencia',
          contratante_rfc: 'RFC',
          contratante_nombres: 'Nombre',
          contratante_curp: 'CURP',
          contratante_calle: 'Dirección',
          matricula: 'Matrícula',
          clave_delegacional: 'Clave Delegacional',
          ocr_clave_presupuestal: 'Clave Presupuestal',
          ocr_centro_trabajo: 'Centro de Trabajo',
          ocr_llave_descuento: 'Llave de Descuento',
          ocr_concepto_descuento: 'Concepto de Descuento',
          ocr_tipo_contratacion: 'Tipo de Contratación',
          ocr_liquido_a_cobrar: 'Líquido a Cobrar',
          ocr_clave_elector: 'Clave Elector',
        }

        return (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-2">
                <span className="text-blue-600 text-lg mt-0.5">📋</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">
                    Datos pre-llenados por OCR ({sourcedFields.length})
                  </p>
                  <p className="text-xs text-blue-700 mt-1 mb-3">
                    Estos campos se llenaron automáticamente. Puedes editarlos en los pasos siguientes.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {sourcedFields.map((fieldKey) => {
                      const value = (formData as unknown as Record<string, unknown>)[fieldKey]
                      const label = FIELD_LABELS[fieldKey] || fieldKey
                      return (
                        <div
                          key={fieldKey}
                          className="flex items-center gap-2 rounded-md border border-blue-200 bg-white px-2.5 py-1.5"
                        >
                          <span className="text-blue-500 text-xs">✦</span>
                          <div className="min-w-0 flex-1">
                            <span className="text-xs text-gray-500 block">{label}</span>
                            <span className="text-sm text-gray-800 font-medium truncate block">
                              {String(value || '—')}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12">
          ← Atrás
        </Button>
        <Button onClick={onNext} className="flex-1 h-12 bg-[#003087] hover:bg-[#002070]">
          Continuar →
        </Button>
      </div>
    </div>
  )
}
