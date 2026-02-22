'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormData } from '@/lib/types'

interface StepDocumentosProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

interface DocUploadState {
  uploading: boolean
  uploaded: boolean
  error?: string
  previewUrl?: string
}

export default function StepDocumentos({ formData, setFormData, onNext, onBack }: StepDocumentosProps) {
  const [uploadStates, setUploadStates] = useState<Record<string, DocUploadState>>({})

  function setUploadState(key: string, state: Partial<DocUploadState>) {
    setUploadStates(prev => ({
      ...prev,
      [key]: { ...prev[key], ...state }
    }))
  }

  async function handleFileUpload(key: string, file: File) {
    setUploadState(key, { uploading: true, error: undefined })

    try {
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
      
      const filename = `${formData.folio}/${key}-${Date.now()}.${file.name.split('.').pop()}`
      
      const response = await fetch(
        `${SUPABASE_URL}/storage/v1/object/solicitud-docs/${filename}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'apikey': SUPABASE_KEY,
            'Content-Type': file.type,
            'x-upsert': 'true',
          },
          body: file,
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Error al subir archivo')
      }

      const previewUrl = URL.createObjectURL(file)
      setUploadState(key, { uploading: false, uploaded: true, previewUrl })
      setFormData({ [`docs_${key}`]: filename } as Partial<FormData>)

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al subir, intenta de nuevo'
      setUploadState(key, { uploading: false, uploaded: false, error: errorMsg })
    }
  }

  function DocUploadCard({ 
    docKey, 
    title, 
    description, 
    required = false,
    accept = "image/*",
    capture 
  }: {
    docKey: string
    title: string
    description: string
    required?: boolean
    accept?: string
    capture?: 'user' | 'environment'
  }) {
    const state = uploadStates[docKey] || {}

    return (
      <Card className={state.uploaded ? 'border-green-200 bg-green-50' : ''}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="font-medium text-sm text-gray-800">
                {title} {required && <span className="text-red-500">*</span>}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              {state.error && (
                <p className="text-red-500 text-xs mt-1">{state.error}</p>
              )}
            </div>
            
            <div className="flex-shrink-0">
              {state.uploaded ? (
                <div className="flex items-center gap-2">
                  {state.previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={state.previewUrl}
                      alt={title}
                      className="w-10 h-10 object-cover rounded-lg border"
                    />
                  )}
                  <span className="text-green-500 text-xl">✓</span>
                  <label htmlFor={`file-${docKey}`} className="cursor-pointer text-xs text-blue-600 underline">
                    Cambiar
                  </label>
                </div>
              ) : (
                <label
                  htmlFor={`file-${docKey}`}
                  className={`
                    flex items-center justify-center w-12 h-12 rounded-xl border-2 cursor-pointer
                    ${state.uploading
                      ? 'border-gray-200 bg-gray-100'
                      : 'border-[#003087] bg-blue-50 hover:bg-blue-100'}
                  `}
                >
                  {state.uploading ? (
                    <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  ) : (
                    <span className="text-2xl">📷</span>
                  )}
                </label>
              )}
              <input
                id={`file-${docKey}`}
                type="file"
                accept={accept}
                capture={capture}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(docKey, file)
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const ineUploaded = uploadStates['ine_frente']?.uploaded
  const requiredDocsCount = formData.forma_cobro === 'nomina' ? 3 : 2
  const uploadedCount = ['ine_frente', 'ine_reverso', 'talon'].filter(k => uploadStates[k]?.uploaded).length

  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-[#003087]">Documentos</h2>
        <p className="text-sm text-gray-500">Toma fotos de los documentos requeridos</p>
      </div>

      {/* Progress */}
      <div className="bg-gray-100 rounded-xl p-3 text-center">
        <p className="text-sm text-gray-600">
          Documentos subidos: <span className="font-bold text-[#003087]">{uploadedCount}</span>
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
            description="Graba un video corto del cliente con la solicitud"
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
        <Button 
          onClick={onNext}
          className="flex-1 h-12 bg-[#003087] hover:bg-[#002070]"
        >
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
