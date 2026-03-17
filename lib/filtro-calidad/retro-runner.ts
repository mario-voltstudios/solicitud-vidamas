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
  let q = supabase.from('solicitudes').select('*')

  switch (scope.type) {
    case 'policy':
      q = q.in('policy_number', scope.policy_numbers ?? [])
      break
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
  _supabase: SupabaseClient
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

  // -- Check: video absent (retro) --
  if (!sol.docs_video) {
    findings.push({
      quality_run_id: runId,
      solicitud_id: solId,
      policy_number: polNum ?? undefined,
      agent_id: agentId,
      dependencia: dep,
      severity: 'stop',
      category: 'doc_authenticity',
      rule_code: RULE_CODES.VIDEO_MISSING,
      status_label: 'blocked_doc_authenticity_risk',
      title: 'Video de verificación faltante',
      detail: 'No se encontró video en esta solicitud.',
    })
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
