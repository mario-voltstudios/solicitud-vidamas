'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { FormData } from '@/lib/types'
import imageCompression from 'browser-image-compression'

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

export default function StepDocumentos({ formData, setFormData, onNext, onBack }: StepDocumentosProps) {
  const [uploadStates, setUploadStates] = useState<Record<string, DocUploadState>>({})

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
        // Compress images
        uploadFile = await imageCompression(file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: 'image/jpeg',
          initialQuality: 0.8,
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
        (pct) => setState(key, { progress: 5 + Math.round(pct * 0.85) }) // 5-90%
      )

      if (!response.ok) {
        const err = JSON.parse(await response.text())
        throw new Error(err.message || 'Error al subir archivo')
      }

      setState(key, { progress: 95 })

      // Generate signed URL for preview
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
        // Auto-retry up to 3 times
        console.warn(`Upload failed attempt ${attempt}, retrying...`, err)
        setState(key, { status: 'uploading', progress: 0, error: `Reintentando... (${attempt}/3)` })
        setTimeout(() => handleFileUpload(key, file, attempt + 1), 1500)
        return
      }
      const msg = err instanceof Error ? err.message : 'Error al subir, intenta de nuevo'
      setState(key, { status: 'error', progress: 0, error: msg })
    }
  }

  function DocUploadCard({
    docKey,
    title,
    description,
    required = false,
    accept = 'image/*',
    capture,
  }: {
    docKey: string
    title: string
    description: string
    required?: boolean
    accept?: string
    capture?: 'user' | 'environment'
  }) {
    const s = uploadStates[docKey] || { status: 'idle', progress: 0 }
    const isDone = s.status === 'done'
    const isBusy = s.status === 'compressing' || s.status === 'uploading'
    const isVideo = s.isVideo || accept === 'video/*'

    return (
      <Card className={isDone ? 'border-green-200 bg-green-50' : s.status === 'error' ? 'border-red-200' : ''}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-800 truncate">
                {title} {required && <span className="text-red-500">*</span>}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>

              {/* Progress bar */}
              {isBusy && (
                <div className="mt-2">
                  <Progress value={s.progress} className="h-1.5" />
                  <p className="text-xs text-blue-600 mt-1">
                    {s.status === 'compressing' ? 'Comprimiendo...' : `Subiendo... ${s.progress}%`}
                  </p>
                </div>
              )}

              {s.error && (
                <p className="text-red-500 text-xs mt-1">{s.error}</p>
              )}

              {/* Preview after upload */}
              {isDone && s.previewUrl && !isVideo && (
                <div className="mt-2">
                  <a href={s.signedUrl || s.previewUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.previewUrl}
                      alt={title}
                      className="h-16 w-auto max-w-[120px] object-cover rounded border hover:opacity-80 transition"
                    />
                  </a>
                  <p className="text-xs text-green-700 mt-1">✓ Subido correctamente</p>
                </div>
              )}

              {isDone && isVideo && (
                <div className="mt-2">
                  <video
                    src={s.signedUrl || s.previewUrl}
                    controls
                    className="h-20 w-full max-w-[200px] rounded border bg-black"
                  />
                  <p className="text-xs text-green-700 mt-1">✓ Video subido</p>
                </div>
              )}
            </div>

            {/* Upload button */}
            <div className="flex-shrink-0">
              {isDone ? (
                <div className="text-center">
                  <span className="text-green-500 text-xl block">✓</span>
                  <label htmlFor={`file-${docKey}`} className="cursor-pointer text-xs text-blue-600 underline block">
                    Cambiar
                  </label>
                </div>
              ) : (
                <label
                  htmlFor={`file-${docKey}`}
                  className={`
                    flex items-center justify-center w-12 h-12 rounded-xl border-2 cursor-pointer
                    ${isBusy ? 'border-gray-200 bg-gray-100 cursor-not-allowed' : 'border-[#003087] bg-blue-50 hover:bg-blue-100 active:bg-blue-200'}
                  `}
                >
                  {isBusy ? (
                    <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  ) : (
                    <span className="text-2xl">{isVideo ? '🎥' : '📷'}</span>
                  )}
                </label>
              )}
              <input
                id={`file-${docKey}`}
                type="file"
                accept={accept}
                capture={capture}
                className="hidden"
                disabled={isBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(docKey, file)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const ineUploaded = uploadStates['ine_frente']?.status === 'done'
  const uploadedCount = ['ine_frente', 'ine_reverso', 'talon'].filter(
    (k) => uploadStates[k]?.status === 'done'
  ).length

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Documentos</h2>
        <p className="text-sm text-gray-500">Toma fotos de los documentos requeridos</p>
      </div>

      {/* Progress */}
      <div className="bg-gray-100 rounded-xl p-3 text-center">
        <p className="text-sm text-gray-600">
          Documentos subidos:{' '}
          <span className="font-bold text-[#003087]">{uploadedCount}</span>
          {formData.forma_cobro === 'nomina' && ' / 3 requeridos'}
        </p>
      </div>

      {/* INE */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Identificación (INE)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <DocUploadCard
            docKey="ine_frente"
            title="INE — Frente"
            description="Foto clara del frente de la credencial"
            required
            capture="environment"
          />
          <DocUploadCard
            docKey="ine_reverso"
            title="INE — Reverso"
            description="Foto clara del reverso de la credencial"
            capture="environment"
          />
        </CardContent>
      </Card>

      {/* Talón de pago (solo nómina) */}
      {formData.forma_cobro === 'nomina' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
              Talón de Pago
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DocUploadCard
              docKey="talon"
              title="Talón de pago más reciente"
              description="El talón o recibo de nómina más reciente"
              required
              capture="environment"
            />
          </CardContent>
        </Card>
      )}

      {/* Solicitud pages */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Solicitud Impresa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-gray-500 mb-2">
            Páginas de la solicitud física firmada
          </p>
          {[1, 2, 3, 4, 5, 6].map((page) => (
            <DocUploadCard
              key={page}
              docKey={`solicitud_p${page}`}
              title={`Página ${page}`}
              description={`Foto de la página ${page} de la solicitud`}
              capture="environment"
            />
          ))}
        </CardContent>
      </Card>

      {/* Video */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
            Video de Verificación
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <DocUploadCard
            docKey="video"
            title="Video del cliente"
            description="Graba un video corto del cliente con la solicitud (máx. 100MB)"
            accept="video/*"
            capture="environment"
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12">
          ← Atrás
        </Button>
        <Button onClick={onNext} className="flex-1 h-12 bg-[#003087] hover:bg-[#002070]">
          Continuar →
        </Button>
      </div>

      {!ineUploaded && (
        <p className="text-center text-xs text-amber-600">
          ⚠️ Se recomienda subir el INE antes de continuar
        </p>
      )}
    </div>
  )
}
