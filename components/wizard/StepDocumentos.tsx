'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { FormData } from '@/lib/types'
import imageCompression from 'browser-image-compression'
import { DocRequirement, getDependenciaRequirements, getMissingRequiredDocs } from '@/lib/dependencia-rules'

interface StepDocumentosProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

interface DocUploadState {
  status: 'idle' | 'compressing' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  previewUrl?: string
  signedUrl?: string
  filename?: string
  isVideo?: boolean
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

  async function handleFileUpload(key: string, file: File, attempt = 1) {
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')

    setState(key, { status: 'compressing', progress: 0, error: undefined, isVideo })

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
