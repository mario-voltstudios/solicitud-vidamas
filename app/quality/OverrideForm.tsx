'use client'
// ============================================================
// OverrideForm — client component
// Inline form for Mario to approve/reject a quality finding.
// Calls POST /api/quality/override with bearer token from env.
// ============================================================

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  findingId: string
  findingTitle: string
}

export function OverrideForm({ findingId, findingTitle }: Props) {
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <div className="mt-3 text-sm text-green-700 bg-green-50 rounded p-2">
        ✅ Override registrado — {decision === 'approved' ? 'APROBADO' : 'RECHAZADO'}
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!decision) { setError('Elige aprobado o rechazado.'); return }
    if (reason.trim().length < 10) { setError('Razón muy corta (mínimo 10 caracteres).'); return }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/quality/override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Token must be set as NEXT_PUBLIC_MARIO_OVERRIDE_SECRET in Vercel env
          // WARNING: NEXT_PUBLIC_ exposes value to browser — use only for internal/admin pages
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_MARIO_OVERRIDE_SECRET ?? ''}`,
        },
        body: JSON.stringify({ finding_id: findingId, decision, reason: reason.trim(), notes: notes.trim() || undefined }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as Record<string, string>).error ?? `HTTP ${res.status}`)
      }

      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t pt-4 space-y-3">
      <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Decisión de Override</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDecision('approved')}
          className={`flex-1 py-1.5 rounded text-sm font-medium border transition-colors ${
            decision === 'approved'
              ? 'bg-green-600 text-white border-green-600'
              : 'border-gray-300 text-gray-600 hover:bg-green-50'
          }`}
        >
          ✅ Aprobar — proceder a pesar del hallazgo
        </button>
        <button
          type="button"
          onClick={() => setDecision('rejected')}
          className={`flex-1 py-1.5 rounded text-sm font-medium border transition-colors ${
            decision === 'rejected'
              ? 'bg-red-600 text-white border-red-600'
              : 'border-gray-300 text-gray-600 hover:bg-red-50'
          }`}
        >
          ❌ Rechazar — confirmar bloqueo
        </button>
      </div>

      <div>
        <Label htmlFor={`reason-${findingId}`} className="text-xs">
          Razón <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id={`reason-${findingId}`}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Explica la razón del override (obligatorio, mín. 10 caracteres)"
          rows={2}
          className="mt-1 text-sm"
          required
        />
      </div>

      <div>
        <Label htmlFor={`notes-${findingId}`} className="text-xs">
          Notas adicionales (opcional)
        </Label>
        <Textarea
          id={`notes-${findingId}`}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Contexto adicional, referencias, etc."
          rows={1}
          className="mt-1 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        type="submit"
        disabled={submitting || !decision}
        className="w-full"
        variant={decision === 'approved' ? 'default' : decision === 'rejected' ? 'destructive' : 'secondary'}
      >
        {submitting ? 'Guardando…' : `Confirmar Override — ${decision === 'approved' ? 'APROBAR' : decision === 'rejected' ? 'RECHAZAR' : '...'}`}
      </Button>
    </form>
  )
}
