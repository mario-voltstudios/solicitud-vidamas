// ============================================================
// Filtro de Calidad v1 — Retroactive / On-Demand Runner
// Created: 2026-03-16
//
// Entry point for promptable bulk scans:
//   "Run filtro calidad for all pólizas emitted in February"
//   "Run filtro calidad for agent ABC123, last 365 days"
//   "Run filtro calidad for policy numbers X, Y, Z"
//   "Show only hard stops"
//
// This module is isolated — no edits to existing tables.
// It reads from solicitudes + email_policy_events and writes
// to quality_runs, quality_findings, policy_quality_state.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RunScope,
  QualityRunResult,
  QualityFinding,
  ActionQueueItem,
  QualityStatusLabel,
} from './types'
import { RULE_CODES } from './types'
import { ingestVideo, videoIngestResultToFinding, agentNameFindingFromIngest } from './video-ingest'
import { assessTamperRisk, tamperAssessmentToFinding } from './video-tamper'
import { compareFaces, faceMatchToFinding } from './face-match'
import { validateCFDI, cfdiValidationToFinding } from '@/lib/cfdi'

// ──────────────────────────────────────────────────────────────
// Main entry: run retro/on-demand scan
// ──────────────────────────────────────────────────────────────
export async function runRetroFiltro(
  scope: RunScope,
  supabase: SupabaseClient,
  requestedBy = 'mario'
): Promise<QualityRunResult> {
  // 1. Open run record
  const { data: runRow, error: runErr } = await supabase
    .from('quality_runs')
    .insert({
      run_type: 'retroactive',
      scope_type: scope.type,
      scope_payload: scope,
      status: 'running',
      started_at: new Date().toISOString(),
      requested_by: requestedBy,
    })
    .select('id')
    .single()

  if (runErr || !runRow) throw new Error(`Failed to open quality run: ${runErr?.message}`)

  const runId = runRow.id

  try {
    // 2. Fetch solicitudes matching scope
    const solicitudes = await fetchSolicitudesForScope(scope, supabase)

    // 3. Fetch email signals relevant to these policies
    const policyNumbers = solicitudes
      .map((s: Record<string, unknown>) => s.policy_number as string)
      .filter(Boolean)
    const emailEvents = await fetchEmailEvents(policyNumbers, supabase)

    // 4. Run checks and collect findings
    const allFindings: QualityFinding[] = []
    for (const sol of solicitudes) {
      const findings = await evaluateSolicitud(sol, emailEvents, runId, supabase)
      allFindings.push(...findings)
    }

    // 5. Persist findings
    if (allFindings.length > 0) {
      await supabase.from('quality_findings').insert(
        allFindings.map((f) => ({ ...f, detected_at: new Date().toISOString() }))
      )
    }

    // 6. Upsert policy_quality_state for each evaluated solicitud
    await upsertQualityStates(solicitudes, allFindings, runId, supabase)

    // 7. Build summary + action queue
    const summary = buildSummary(solicitudes.length, allFindings)
    const action_queue = buildActionQueue(allFindings)

    // 8. Mark run complete
    await supabase
      .from('quality_runs')
      .update({ status: 'completed', finished_at: new Date().toISOString(), summary })
      .eq('id', runId)

    return { run_id: runId, run_type: 'retroactive', scope, findings: allFindings, summary, action_queue }
  } catch (err) {
    await supabase
      .from('quality_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error_detail: String(err) })
      .eq('id', runId)
    throw err
  }
}

// ──────────────────────────────────────────────────────────────
// Scope → DB query
// ──────────────────────────────────────────────────────────────
async function fetchSolicitudesForScope(scope: RunScope, supabase: SupabaseClient) {
  if (scope.type === 'policy') {
    const { data: polizas, error: polizasError } = await supabase
      .from('polizas')
      .select('solicitud_id, num_poliza')
      .in('num_poliza', scope.policy_numbers ?? [])

    if (polizasError) throw new Error(`Policy scope query failed: ${polizasError.message}`)

    const pairs = (polizas ?? [])
      .filter((row) => row.solicitud_id && row.num_poliza)
      .map((row) => ({ solicitud_id: row.solicitud_id as string, policy_number: row.num_poliza as string }))

    if (pairs.length) {
      const solicitudIds = [...new Set(pairs.map((row) => row.solicitud_id))]
      const { data: solicitudes, error: solicitudesError } = await supabase
        .from('solicitudes')
        .select('*')
        .in('id', solicitudIds)

      if (solicitudesError) throw new Error(`Scope query failed: ${solicitudesError.message}`)

      const policyBySolicitud = new Map(pairs.map((row) => [row.solicitud_id, row.policy_number]))
      return (solicitudes ?? []).map((sol) => ({
        ...sol,
        policy_number: policyBySolicitud.get(sol.id as string) ?? null,
      }))
    }

    const { data: attributed, error: attributedError } = await supabase
      .from('policy_attribution')
      .select('numero_poliza, folio_v2')
      .in('numero_poliza', scope.policy_numbers ?? [])
      .not('folio_v2', 'is', null)

    if (attributedError) throw new Error(`Policy attribution fallback failed: ${attributedError.message}`)

    const byFolio = new Map(
      (attributed ?? [])
        .filter((row) => row.folio_v2 && row.numero_poliza)
        .map((row) => [row.folio_v2 as string, String(row.numero_poliza)])
    )

    const folios = [...byFolio.keys()]
    if (!folios.length) return []

    const { data: solicitudes, error: solicitudesError } = await supabase
      .from('solicitudes')
      .select('*')
      .in('folio', folios)

    if (solicitudesError) throw new Error(`Policy attribution scope query failed: ${solicitudesError.message}`)

    return (solicitudes ?? []).map((sol) => ({
      ...sol,
      policy_number: byFolio.get(sol.folio as string) ?? null,
    }))
  }

  let q = supabase.from('solicitudes').select('*')

  switch (scope.type) {
    case 'folio':
      q = q.eq('folio', scope.folio)
      break
    case 'agent':
      q = q.in('clave_agente', scope.agent_ids ?? [])
      if (scope.from) q = q.gte('created_at', scope.from)
      if (scope.to) q = q.lte('created_at', scope.to)
      break
    case 'date_range':
      if (scope.from) q = q.gte('created_at', scope.from)
      if (scope.to) q = q.lte('created_at', scope.to)
      break
    case 'dependencia':
      q = q.eq('contratante_dependencia', scope.dependencia)
      if (scope.from) q = q.gte('created_at', scope.from)
      if (scope.to) q = q.lte('created_at', scope.to)
      break
  }

  const { data, error } = await q
  if (error) throw new Error(`Scope query failed: ${error.message}`)
  return data ?? []
}

// ──────────────────────────────────────────────────────────────
// Email events fetch
// ──────────────────────────────────────────────────────────────
async function fetchEmailEvents(policyNumbers: string[], supabase: SupabaseClient) {
  if (policyNumbers.length === 0) return []
  const { data } = await supabase
    .from('email_policy_events')
    .select('*')
    .in('policy_number', policyNumbers)
  return data ?? []
}

// ──────────────────────────────────────────────────────────────
// Per-solicitud evaluation
// ──────────────────────────────────────────────────────────────
async function evaluateSolicitud(
  sol: Record<string, unknown>,
  emailEvents: Record<string, unknown>[],
  runId: string,
  supabase: SupabaseClient
): Promise<QualityFinding[]> {
  const findings: QualityFinding[] = []
  const polNum = sol.policy_number as string | null
  const solId = sol.id as string
  const agentId = sol.clave_agente as string
  const dep = (sol.contratante_dependencia as string) ?? ''

  // -- Check: cancellation email signal --
  if (polNum) {
    const cancelEmails = (emailEvents as Array<Record<string, unknown>>).filter(
      (e) => e.policy_number === polNum && e.event_type === 'cancellation_signal'
    )
    if (cancelEmails.length > 0) {
      findings.push({
        quality_run_id: runId,
        solicitud_id: solId,
        policy_number: polNum,
        agent_id: agentId,
        dependencia: dep,
        severity: 'stop',
        category: 'cancellation',
        rule_code: RULE_CODES.CANCELLATION_EMAIL_MATCH,
        status_label: 'blocked_cancellation_risk',
        title: 'Señal de cancelación detectada en correo',
        detail: `Se encontraron ${cancelEmails.length} email(s) con señal de cancelación para esta póliza.`,
        evidence: { emails: cancelEmails.map((e) => ({ subject: e.raw_subject, from: e.raw_from, occurred_at: e.occurred_at })) },
      })
    }
  }

  // -- Check: expediente issue --
  if (polNum) {
    const expedIssues = (emailEvents as Array<Record<string, unknown>>).filter(
      (e) => e.policy_number === polNum && e.event_type === 'expediente_issue'
    )
    const expedComplete = (emailEvents as Array<Record<string, unknown>>).filter(
      (e) => e.policy_number === polNum && e.event_type === 'expediente_complete'
    )
    if (expedIssues.length > 0) {
      const resolved = expedComplete.length > 0
      const latestIssue = expedIssues.sort(
        (a, b) => new Date(a.occurred_at as string).getTime() - new Date(b.occurred_at as string).getTime()
      ).at(-1)
      const latestComplete = expedComplete.sort(
        (a, b) => new Date(a.occurred_at as string).getTime() - new Date(b.occurred_at as string).getTime()
      ).at(-1)

      let expedState: 'expediente_issue_open' | 'expediente_sla_breached' | 'expediente_resolved_late' = 'expediente_issue_open'
      if (resolved && latestIssue && latestComplete) {
        const issueDate = new Date(latestIssue.occurred_at as string)
        const completeDate = new Date(latestComplete.occurred_at as string)
        const diffDays = (completeDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24)
        expedState = diffDays <= 7 ? 'expediente_issue_open' : 'expediente_resolved_late' // Note: use v_expediente_sla view for authoritative SLA
      } else if (!resolved) {
        // Check SLA breach (> 7 calendar days without COMPLETO)
        const issueDate = latestIssue ? new Date(latestIssue.occurred_at as string) : new Date()
        const diffDays = (Date.now() - issueDate.getTime()) / (1000 * 60 * 60 * 24)
        expedState = diffDays > 7 ? 'expediente_sla_breached' : 'expediente_issue_open'
      }

      const isHardStop = ['expediente_issue_open', 'expediente_sla_breached', 'expediente_resolved_late'].includes(expedState)
      if (isHardStop) {
        findings.push({
          quality_run_id: runId,
          solicitud_id: solId,
          policy_number: polNum,
          agent_id: agentId,
          dependencia: dep,
          severity: 'stop',
          category: 'expediente',
          rule_code: expedState === 'expediente_sla_breached'
            ? RULE_CODES.EXPEDIENTE_SLA_BREACHED
            : RULE_CODES.EXPEDIENTE_ISSUE_OPEN,
          status_label: 'pending_manual_review',
          title: `Expediente Digital — ${expedState}`,
          detail: 'Póliza tiene señal de expediente sin resolución en tiempo.',
          evidence: { expediente_state: expedState },
        })
      }
    }
  }

  // -- Check: video — granular ingestion pipeline + extended verification --
  // Stages: DB link | storage | parse | transcript | frame | statements
  // Extended: agent name detection | tamper/AI-edit signals | face match (if frame available)
  {
    const hasExistingPolicies = sol.asegurado_tiene_otras_polizas === 'Si'
    const agentName = (sol.nombre_agente ?? sol.clave_agente) as string | undefined
    const submissionYear = sol.created_at
      ? new Date(sol.created_at as string).getFullYear()
      : new Date().getFullYear()

    const videoResult = await ingestVideo(
      sol.docs_video as string | null | undefined,
      supabase,
      {
        hasExistingPolicies,
        agentName,
      }
    )

    // Primary video finding (storage/parse/statements)
    const videoFinding = videoIngestResultToFinding(
      videoResult,
      solId,
      polNum,
      agentId,
      dep,
      runId
    )
    if (videoFinding) findings.push(videoFinding)

    // Agent name finding (only if transcript was obtained)
    if (videoResult.transcript && agentName) {
      const agentNameFinding = agentNameFindingFromIngest(
        videoResult,
        agentName,
        solId,
        polNum,
        agentId,
        dep,
        runId
      )
      if (agentNameFinding) findings.push(agentNameFinding)
    }

    // Tamper / AI-edit risk assessment (text signals + optional vision)
    if (videoResult.transcript) {
      const tamperAssessment = await assessTamperRisk(
        videoResult.transcript,
        videoResult.frame_b64,
        submissionYear
      )
      const tamperFinding = tamperAssessmentToFinding(
        tamperAssessment,
        solId,
        polNum,
        agentId,
        dep,
        runId
      )
      if (tamperFinding) findings.push(tamperFinding)
    }

    // Face match: INE photo vs video frame (if both available)
    const inePhoto = (sol.docs_ine_foto ?? sol.docs_ine) as string | undefined
    const videoFrame = videoResult.frame_b64
    if (inePhoto && videoFrame) {
      try {
        const faceResult = await compareFaces(inePhoto, videoFrame)
        const faceFinding = faceMatchToFinding(faceResult, solId, polNum ?? undefined)
        if (faceFinding) findings.push({ ...faceFinding, quality_run_id: runId, agent_id: agentId, dependencia: dep })
      } catch {
        // Face match errors are non-blocking
      }
    } else if (videoResult.status === 'ok' && videoResult.stage === 'complete') {
      // Video available but no frame extracted (frame provider not configured)
      // Already handled by frame_extraction stage in videoIngestResultToFinding when frame provider = none
      // Only add face_match inconclusive if we have INE but no frame
      if (inePhoto && !videoFrame) {
        const { RULE_CODES } = await import('./types')
        findings.push({
          quality_run_id: runId,
          solicitud_id: solId,
          policy_number: polNum ?? undefined,
          agent_id: agentId,
          dependencia: dep,
          severity: 'flag',
          category: 'face_match',
          rule_code: RULE_CODES.FACE_MATCH_INCONCLUSIVE,
          status_label: 'pending_manual_review',
          title: 'Face match: no se pudo extraer frame — revisión manual',
          detail: 'VIDEO_FRAME_PROVIDER no configurado. Configure ffmpeg o equivalente para habilitar face match automático.',
          evidence: { reason: 'frame_provider_none' },
          detected_at: new Date().toISOString(),
        })
      }
    }
  }

  // -- Check: existing policy / reciclado --
  if (sol.asegurado_tiene_otras_polizas === 'Si') {
    findings.push({
      quality_run_id: runId,
      solicitud_id: solId,
      policy_number: polNum ?? undefined,
      agent_id: agentId,
      dependencia: dep,
      severity: 'flag',
      category: 'existing_policy',
      rule_code: RULE_CODES.EXISTING_POLICY_NO_CONSENT,
      status_label: 'retroactive_watch',
      title: 'Asegurado declaró tener pólizas — verificar consentimiento en video',
      detail: 'Campo asegurado_tiene_otras_polizas = Si. Requiere revisión de video para confirmar consentimiento.',
    })
  }

  // -- Check: CFDI / Talón de pago --
  // Try to decode the talon document natively (native QR decode wired in validate-cfdi.ts).
  // Checks: (1) duplicate UUID, (2) SAT status (Vigente/Cancelado/No Encontrado)
  // Non-blocking: errors produce flags, not hard stops.
  const talonPath = (sol.docs_talon ?? sol.url_tarjeton) as string | undefined
  if (talonPath) {
    try {
      const cfdiResult = await validateCFDI({
        supabase,
        talonPath,
        solicitudId: solId,
        qualityRunId: runId,
        // No ocrText — native QR decode will be attempted
      })
      const cfdiF = cfdiValidationToFinding(cfdiResult, solId, agentId, dep)
      if (cfdiF) findings.push({ ...cfdiF, quality_run_id: runId, policy_number: polNum ?? undefined })
    } catch (err) {
      // CFDI errors must never fail the overall run
      console.error('[RetroRunner] CFDI validation error (non-blocking):', err)
    }
  }

  return findings
}

// ──────────────────────────────────────────────────────────────
// Upsert policy_quality_state for evaluated solicitudes
// ──────────────────────────────────────────────────────────────
async function upsertQualityStates(
  solicitudes: Record<string, unknown>[],
  findings: QualityFinding[],
  runId: string,
  supabase: SupabaseClient
) {
  const findingsBySolicitud = new Map<string, QualityFinding[]>()
  for (const f of findings) {
    if (f.solicitud_id) {
      const existing = findingsBySolicitud.get(f.solicitud_id) ?? []
      existing.push(f)
      findingsBySolicitud.set(f.solicitud_id, existing)
    }
  }

  const rows = solicitudes.map((sol) => {
    const solId = sol.id as string
    const solFindings = findingsBySolicitud.get(solId) ?? []
    const hasStop = solFindings.some((f) => f.severity === 'stop')
    const flagCount = solFindings.filter((f) => f.severity === 'flag').length
    const stopCount = solFindings.filter((f) => f.severity === 'stop').length
    let overall_state: QualityStatusLabel = 'approved_for_emision'
    if (hasStop) overall_state = solFindings.find((f) => f.severity === 'stop')?.status_label ?? 'pending_manual_review'
    else if (flagCount > 0) overall_state = 'retroactive_watch'

    return {
      solicitud_id: solId,
      policy_number: (sol.policy_number as string) ?? null,
      overall_state,
      hard_stop_count: stopCount,
      flag_count: flagCount,
      latest_run_id: runId,
      override_required: hasStop,
      updated_at: new Date().toISOString(),
    }
  })

  if (rows.length > 0) {
    await supabase
      .from('policy_quality_state')
      .upsert(rows, { onConflict: 'solicitud_id,policy_number' })
  }
}

// ──────────────────────────────────────────────────────────────
// Summary builder
// ──────────────────────────────────────────────────────────────
function buildSummary(total: number, findings: QualityFinding[]) {
  const by_category: Record<string, number> = {}
  for (const f of findings) {
    by_category[f.category] = (by_category[f.category] ?? 0) + 1
  }
  return {
    total_evaluated: total,
    hard_stops: findings.filter((f) => f.severity === 'stop').length,
    flags: findings.filter((f) => f.severity === 'flag').length,
    infos: findings.filter((f) => f.severity === 'info').length,
    by_category,
    requires_mario_review: findings.some((f) => f.severity === 'stop'),
  }
}

// ──────────────────────────────────────────────────────────────
// Action queue builder
// ──────────────────────────────────────────────────────────────
function buildActionQueue(findings: QualityFinding[]): ActionQueueItem[] {
  return findings
    .filter((f) => f.severity === 'stop')
    .map((f) => ({
      priority: 'urgent' as const,
      type: 'mario_override_required' as const,
      solicitud_id: f.solicitud_id ?? undefined,
      policy_number: f.policy_number ?? undefined,
      description: f.title,
      rule_code: f.rule_code,
    }))
}
