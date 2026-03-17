// ============================================================
// Filtro de Calidad v1 — Intake Enforcement Hook
// Created: 2026-03-16
//
// Usage: call runIntakeFiltro(formData, supabase) from
// submitSolicitud() in app/solicitud/actions.ts BEFORE the
// Supabase insert.  If blocked=true, return the block to the
// wizard immediately — do NOT persist.
//
// This module is isolated from schema work. It writes only to
// quality_findings / quality_runs / policy_quality_state.
// ============================================================

import type { FormData } from '@/lib/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  QualityFinding,
  IntakeFiltroResult,
  QualityStatusLabel,
} from './types'
import { RULE_CODES } from './types'
import { compareFaces, faceMatchToFinding } from './face-match'

// ──────────────────────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────────────────────
export async function runIntakeFiltro(
  formData: FormData,
  supabase: SupabaseClient,
  solicitudId?: string
): Promise<IntakeFiltroResult> {
  const findings: QualityFinding[] = []

  // -- Rule A: Video present --
  if (!formData.docs_video) {
    findings.push({
      severity: 'stop',
      category: 'doc_authenticity',
      rule_code: RULE_CODES.VIDEO_MISSING,
      status_label: 'blocked_doc_authenticity_risk',
      title: 'Video de verificación faltante',
      detail: 'El video es obligatorio para emisión.',
    })
  }

  // -- Rule B: Seller/agent in video --
  if (formData.docs_video && !formData.nombre_agente) {
    findings.push({
      severity: 'stop',
      category: 'seller_mismatch',
      rule_code: RULE_CODES.SELLER_NAME_MISSING,
      status_label: 'pending_manual_review',
      title: 'Nombre del agente no capturado',
      detail: 'El nombre del agente debe estar en el video y coincidir con el agente de registro.',
    })
  }

  // -- Rule B2: Face match — INE photo vs video frame --
  // compareFaces() is a no-op when FACE_MATCH_PROVIDER=none (default).
  // When provider is configured, runs async face comparison.
  // Inconclusive/skipped → flag (manual review), not a hard stop.
  // Mismatch → hard stop.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fd = formData as any
  const inePhoto: string | undefined = fd.docs_ine_foto as string | undefined
  const videoFrame: string | undefined = fd.docs_video_frame as string | undefined
  if (inePhoto && videoFrame) {
    try {
      const faceResult = await compareFaces(inePhoto, videoFrame)
      const faceFinding = faceMatchToFinding(faceResult, solicitudId)
      if (faceFinding) findings.push(faceFinding)
    } catch {
      // Face match errors must never block submission — already handled inside compareFaces
    }
  } else if (formData.docs_video && !videoFrame) {
    // Video present but no frame extracted — route to manual review
    findings.push({
      severity: 'flag',
      category: 'face_match',
      rule_code: RULE_CODES.FACE_MATCH_INCONCLUSIVE,
      status_label: 'pending_manual_review',
      title: 'Face match: frame de video no disponible — revisión manual',
      detail: 'No se pudo extraer frame del video para comparación facial con INE.',
      detected_at: new Date().toISOString(),
    })
  }

  // -- Rule C: Existing policy / reciclado --
  if (formData.asegurado_tiene_otras_polizas === 'Si') {
    // For intake, we flag for manual review — video content check is async
    findings.push({
      severity: 'flag',
      category: 'existing_policy',
      rule_code: RULE_CODES.EXISTING_POLICY_NO_CONSENT,
      status_label: 'pending_manual_review',
      title: 'Asegurado tiene pólizas vigentes — verificar consentimiento en video',
      detail:
        'El video debe incluir declaración explícita de que el asegurado NO desea cancelar sus pólizas actuales.',
      evidence: { asegurado_tiene_otras_polizas: formData.asegurado_tiene_otras_polizas },
    })
  }

  // -- Rule D: Duplicate RFC within same week+agent (already partially checked in actions.ts) --
  // Cross-agent duplicate check happens in retro runner; intake only checks same-agent.
  // No duplicate logic here to avoid conflicting with existing dedup check in actions.ts.

  // -- Rule E: Payroll capacity gate (GOB CDMX / SEP — Nomipay required) --
  // Nomipay verification is async (external system); flag as pending at intake.
  const dep = formData.contratante_dependencia?.toUpperCase() ?? ''
  if (dep.includes('GOB') || dep.includes('CDMX') || dep.includes('SEP')) {
    findings.push({
      severity: 'flag',
      category: 'payroll_capacity',
      rule_code: RULE_CODES.PAYROLL_NOMIPAY_FAIL,
      status_label: 'pending_manual_review',
      title: `Nomipay requerido — ${formData.contratante_dependencia}`,
      detail:
        'Esta dependencia requiere verificación de capacidad de pago en Nomipay antes de emisión.',
      evidence: { dependencia: formData.contratante_dependencia },
    })
  }

  // -- Derive overall status --
  const hasStop = findings.some((f) => f.severity === 'stop')
  const hasFlag = findings.some((f) => f.severity === 'flag')
  let status_label: QualityStatusLabel = 'approved_for_emision'
  if (hasStop) {
    // Pick the most severe stop's label
    status_label =
      findings.find((f) => f.severity === 'stop')?.status_label ?? 'pending_manual_review'
  } else if (hasFlag) {
    status_label = 'pending_manual_review'
  }

  // -- Persist run + findings --
  try {
    const { data: runRow } = await supabase
      .from('quality_runs')
      .insert({
        run_type: 'intake',
        scope_type: 'folio',
        scope_payload: { folio: formData.folio, clave_agente: formData.clave_agente },
        status: 'completed',
        finished_at: new Date().toISOString(),
        requested_by: formData.clave_agente || 'wizard',
        summary: {
          total_evaluated: 1,
          hard_stops: findings.filter((f) => f.severity === 'stop').length,
          flags: findings.filter((f) => f.severity === 'flag').length,
        },
      })
      .select('id')
      .single()

    if (runRow && findings.length > 0) {
      const rows = findings.map((f) => ({
        ...f,
        quality_run_id: runRow.id,
        solicitud_id: solicitudId ?? null,
        agent_id: formData.clave_agente,
        dependencia: formData.contratante_dependencia,
        detected_at: new Date().toISOString(),
      }))
      await supabase.from('quality_findings').insert(rows)

      // Upsert policy_quality_state
      await supabase.from('policy_quality_state').upsert(
        {
          solicitud_id: solicitudId ?? null,
          policy_number: null,
          overall_state: status_label,
          hard_stop_count: findings.filter((f) => f.severity === 'stop').length,
          flag_count: findings.filter((f) => f.severity === 'flag').length,
          latest_run_id: runRow.id,
          override_required: hasStop,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'solicitud_id,policy_number' }
      )
    }
  } catch (err) {
    // Quality persistence failure must NEVER block submission
    console.error('[IntakeFiltro] Persistence error (non-blocking):', err)
  }

  const summary_text = hasStop
    ? `❌ Bloqueado — ${findings.filter((f) => f.severity === 'stop').length} parada(s) dura(s) detectada(s).`
    : hasFlag
    ? `⚠️ ${findings.filter((f) => f.severity === 'flag').length} señal(es) para revisión — puede continuar con supervisión.`
    : '✅ Sin bloqueos detectados en pre-emisión.'

  return {
    blocked: hasStop,
    findings,
    status_label,
    summary_text,
  }
}
