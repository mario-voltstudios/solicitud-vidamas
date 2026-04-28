'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { FormData } from '@/lib/types'
import {
  type VideoRequirement,
  type VideoRequirementState,
  type VideoRequirementStatus,
  VIDEO_REQUIREMENTS,
  createDefaultVideoStates,
  countByStatus,
  allVideosComplete,
  getVideoCompletionPct,
  videoStoragePath,
} from '@/lib/video/requirement-types'

// ── Constants ──────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const BUCKET = 'solicitud-docs'

// ── Props ──────────────────────────────────────────────────

interface StepVideoProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
  onBack: () => void
}

// ── Helpers ────────────────────────────────────────────────

function statusLabel(s: VideoRequirementStatus): string {
  switch (s) {
    case 'pending': return 'Pendiente'
    case 'recording': return 'Grabando…'
    case 'uploading': return 'Subiendo…'
    case 'complete': return 'Completado ✓'
    case 'review': return 'Requiere revisión'
  }
}

function statusColor(s: VideoRequirementStatus): string {
  switch (s) {
    case 'pending': return 'border-gray-200 bg-white'
    case 'recording': return 'border-red-300 bg-red-50'
    case 'uploading': return 'border-blue-300 bg-blue-50'
    case 'complete': return 'border-green-300 bg-green-50'
    case 'review': return 'border-amber-300 bg-amber-50'
  }
}

function statusBadge(s: VideoRequirementStatus): string {
  switch (s) {
    case 'pending': return 'bg-gray-100 text-gray-600'
    case 'recording': return 'bg-red-100 text-red-700'
    case 'uploading': return 'bg-blue-100 text-blue-700'
    case 'complete': return 'bg-green-100 text-green-700'
    case 'review': return 'bg-amber-100 text-amber-700'
  }
}

async function getSignedUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`,
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

async function uploadVideoToSupabase(
  path: string,
  blob: Blob,
  onProgress: (pct: number) => void
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`)
    xhr.setRequestHeader('apikey', SUPABASE_KEY)
    xhr.setRequestHeader('Content-Type', 'video/webm')
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(true)
      else reject(new Error(`Upload failed: ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(blob)
  })
}

// ── Component ──────────────────────────────────────────────

export default function StepVideo({ formData, setFormData, onNext, onBack }: StepVideoProps) {
  const [states, setStates] = useState<Record<string, VideoRequirementState>>(createDefaultVideoStates)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const counts = useMemo(() => countByStatus(states), [states])
  const completionPct = useMemo(() => getVideoCompletionPct(states), [states])
  const isComplete = useMemo(() => allVideosComplete(states), [states])

  // Restore playback URL from existing storage paths
  useEffect(() => {
    for (const req of VIDEO_REQUIREMENTS) {
      const fieldKey = `video_${req.key}` as keyof FormData
      const existingPath = formData[fieldKey]
      if (existingPath && typeof existingPath === 'string' && !states[req.key]?.storagePath) {
        getSignedUrl(existingPath).then((url) => {
          if (url) {
            setStates((prev) => ({
              ...prev,
              [req.key]: { status: 'complete', storagePath: existingPath, signedUrl: url },
            }))
          }
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  const updateState = useCallback((key: string, patch: Partial<VideoRequirementState>) => {
    setStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }, [])

  // ── Camera Recording ───────────────────────────────────

  const startRecording = useCallback(async (key: string) => {
    try {
      setActiveKey(key)
      setRecordedBlob(null)
      setPlaybackUrl(null)
      updateState(key, { status: 'recording', error: undefined })

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true
        videoRef.current.play()
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus',
      })
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        setRecordedBlob(blob)
        const url = URL.createObjectURL(blob)
        setPlaybackUrl(url)
        updateState(key, { status: 'pending' }) // back to pending until uploaded

        if (videoRef.current) {
          videoRef.current.srcObject = null
          videoRef.current.src = url
          videoRef.current.muted = false
          videoRef.current.play()
        }

        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(1000)
      setIsRecording(true)
    } catch {
      updateState(key, { status: 'pending', error: 'No se pudo acceder a la cámara. Verifica permisos.' })
      setActiveKey(null)
    }
  }, [updateState])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [])

  // ── File Select (upload pre-recorded video) ────────────

  const handleFileSelect = useCallback((key: string, file: File) => {
    if (!file.type.startsWith('video/')) {
      updateState(key, { error: 'Solo se aceptan archivos de video.' })
      return
    }
    if (file.size > 500 * 1024 * 1024) {
      updateState(key, { error: 'Video demasiado grande. Máximo 500MB.' })
      return
    }

    setActiveKey(key)
    setRecordedBlob(file)
    const url = URL.createObjectURL(file)
    setPlaybackUrl(url)
    updateState(key, { status: 'pending', error: undefined })
  }, [updateState])

  // ── Upload to Supabase ─────────────────────────────────

  const handleUpload = useCallback(async (key: string) => {
    if (!recordedBlob) return

    const path = videoStoragePath(formData.folio || `tmp-${Date.now()}`, key)
    updateState(key, { status: 'uploading', uploadProgress: 0, error: undefined })

    try {
      await uploadVideoToSupabase(path, recordedBlob, (pct) => {
        updateState(key, { uploadProgress: pct })
      })

      const signedUrl = await getSignedUrl(path)

      updateState(key, {
        status: 'complete',
        storagePath: path,
        signedUrl: signedUrl || undefined,
        uploadProgress: 100,
        reviewedAt: new Date().toISOString(),
      })

      // Persist to formData
      const fieldKey = `video_${key}` as keyof FormData
      setFormData({ [fieldKey]: path } as Partial<FormData>)

      // Reset active recording state
      setActiveKey(null)
      setRecordedBlob(null)
      setPlaybackUrl(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir video'
      updateState(key, { status: 'pending', error: msg })
    }
  }, [recordedBlob, formData.folio, setFormData, updateState])

  // ── Mark as needs review ───────────────────────────────

  const markForReview = useCallback((key: string) => {
    updateState(key, {
      status: 'review',
      reviewedAt: new Date().toISOString(),
    })
  }, [updateState])

  // ── Re-record ──────────────────────────────────────────

  const handleRerecord = useCallback((key: string) => {
    setActiveKey(null)
    setRecordedBlob(null)
    setPlaybackUrl(null)
    updateState(key, { status: 'pending', error: undefined })
  }, [updateState])

  // ── Requirement Card ───────────────────────────────────

  function RequirementCard({ req }: { req: VideoRequirement }) {
    const s = states[req.key] || { status: 'pending' as VideoRequirementStatus }
    const isActive = activeKey === req.key
    const canRecord = s.status === 'pending' && !activeKey
    const canUpload = isActive && recordedBlob && !isRecording

    return (
      <Card className={statusColor(s.status)}>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg font-bold text-gray-400">{req.order}</span>
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold truncate">{req.title}</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{req.description}</p>
              </div>
            </div>
            <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(s.status)}`}>
              {statusLabel(s.status)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4 px-4">
          {/* Prompt text */}
          <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-600 italic leading-relaxed">
              💬 &ldquo;{req.prompt}&rdquo;
            </p>
          </div>

          {/* Upload progress */}
          {s.status === 'uploading' && (
            <div className="mb-3">
              <Progress value={s.uploadProgress ?? 0} className="h-2" />
              <p className="text-xs text-blue-600 mt-1">Subiendo… {s.uploadProgress ?? 0}%</p>
            </div>
          )}

          {/* Error */}
          {s.error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              {s.error}
            </div>
          )}

          {/* Active recording preview */}
          {isActive && (isRecording || playbackUrl) && (
            <div className="mb-3">
              <video
                ref={isActive ? videoRef : undefined}
                className="w-full rounded-lg bg-black max-h-48 object-cover"
                autoPlay
                playsInline
                controls={!isRecording}
              />
              {isRecording && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-red-600">Grabando…</span>
                </div>
              )}
            </div>
          )}

          {/* Signed URL playback for completed */}
          {!isActive && s.status === 'complete' && s.signedUrl && (
            <div className="mb-3">
              <video
                src={s.signedUrl}
                className="w-full rounded-lg bg-black max-h-48 object-cover"
                controls
                playsInline
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Record button */}
            {canRecord && (
              <Button size="sm" variant="default" onClick={() => startRecording(req.key)}>
                📹 Grabar
              </Button>
            )}

            {/* File upload button */}
            {canRecord && (
              <label>
                <Button size="sm" variant="outline" asChild>
                  <span>📁 Subir archivo</span>
                </Button>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(req.key, file)
                  }}
                />
              </label>
            )}

            {/* Stop recording */}
            {isActive && isRecording && (
              <Button size="sm" variant="destructive" onClick={stopRecording}>
                ⏹ Detener
              </Button>
            )}

            {/* Upload recorded video */}
            {canUpload && (
              <>
                <Button size="sm" variant="default" onClick={() => handleUpload(req.key)}>
                  ✅ Subir y completar
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleRerecord(req.key)}>
                  🔄 Re-grabar
                </Button>
              </>
            )}

            {/* Review / re-record for completed */}
            {s.status === 'complete' && !isActive && (
              <>
                <Button size="sm" variant="outline" onClick={() => markForReview(req.key)}>
                  ⚠️ Marcar para revisión
                </Button>
                <Button size="sm" variant="ghost" onClick={() => startRecording(req.key)}>
                  🔄 Re-grabar
                </Button>
              </>
            )}

            {/* Mark complete from review */}
            {s.status === 'review' && !isActive && (
              <>
                <Button size="sm" variant="default" onClick={() => startRecording(req.key)}>
                  📹 Re-grabar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Main Render ────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold">Video de verificación</h2>
        <p className="text-sm text-gray-600 mt-1">
          Graba o sube un video corto para cada uno de los 7 requisitos de emisión.
          El asegurado debe mencionar el texto guía mostrado en cada tarjeta.
        </p>
      </div>

      {/* Overall progress */}
      <div className="p-4 bg-gray-50 rounded-xl border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">
            Progreso general
          </span>
          <span className="text-sm font-bold text-gray-900">
            {counts.complete}/7 completados
          </span>
        </div>
        <Progress value={completionPct} className="h-3" />
        <div className="flex gap-3 mt-2 text-xs text-gray-500">
          <span>⏳ Pendientes: {counts.pending}</span>
          <span>✅ Completados: {counts.complete}</span>
          <span>⚠️ En revisión: {counts.review}</span>
        </div>
      </div>

      {/* All-complete banner */}
      {isComplete && (
        <div className="p-4 bg-green-50 border border-green-300 rounded-xl flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-bold text-green-800">Todos los videos completados</p>
            <p className="text-sm text-green-700">Ya puedes continuar al siguiente paso.</p>
          </div>
        </div>
      )}

      {/* Requirement cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {VIDEO_REQUIREMENTS.map((req) => (
          <RequirementCard key={req.key} req={req} />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 justify-center pt-4">
        <Button variant="outline" onClick={onBack}>
          Atrás
        </Button>
        <Button onClick={onNext} disabled={!isComplete}>
          Continuar
        </Button>
      </div>
    </div>
  )
}
