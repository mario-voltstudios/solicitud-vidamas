/**
 * GET /api/quality/report/batch?from=YYYY-MM-DD&to=YYYY-MM-DD&dependencia=X&agent_id=Y
 * Returns a batch quality summary PDF for all solicitudes matching the filter.
 * Pulls real findings, CFDI evidence, and override data from DB.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  buildBatchQualityPdf,
  type BatchReportInput,
  type PolicyReportInput,
  type QualityReportFinding,
} from '@/lib/quality-report-pdf'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const dependencia = searchParams.get('dependencia')
    const agent_id = searchParams.get('agent_id')
    const generated_at = new Date().toISOString()

    const supabase = createServerClient()

    // Build findings query with optional filters
    let findingsQuery = supabase
      .from('quality_findings')
      .select('id, severity, category, rule_code, title, detail, detected_at, resolved_at, resolution_notes, evidence, policy_number, solicitud_id, agent_id, dependencia')
      .order('detected_at', { ascending: false })
      .limit(500)

    if (from) findingsQuery = findingsQuery.gte('detected_at', from)
    if (to) findingsQuery = findingsQuery.lte('detected_at', `${to}T23:59:59`)
    if (dependencia) findingsQuery = findingsQuery.eq('dependencia', dependencia)
    if (agent_id) findingsQuery = findingsQuery.eq('agent_id', agent_id)

    const { data: allFindings } = await findingsQuery

    // Group findings by solicitud_id
    const bySOL = new Map<string, typeof allFindings>()
    for (const f of allFindings ?? []) {
      const sid = f.solicitud_id ?? 'unknown'
      if (!bySOL.has(sid)) bySOL.set(sid, [])
      bySOL.get(sid)!.push(f)
    }

    // Fetch solicitud metadata for all affected solicitudes
    const solIds = [...bySOL.keys()].filter((s) => s !== 'unknown')
    let solMap = new Map<string, { folio?: string; contratante_nombres?: string; contratante_ap_paterno?: string; clave_agente?: string; dependencia?: string }>()
    if (solIds.length > 0) {
      const { data: sols } = await supabase
        .from('solicitudes')
        .select('id, folio, contratante_nombres, contratante_ap_paterno, clave_agente, dependencia')
        .in('id', solIds)
      for (const s of sols ?? []) solMap.set(s.id, s)
    }

    // Fetch CFDI extractions for all solicitudes
    let cfdiMap = new Map<string, { qr_data: unknown; sat_result: unknown; duplicate_detected: boolean; extraction_method: string; extracted_at: string }>()
    if (solIds.length > 0) {
      const { data: cfdis } = await supabase
        .from('cfdi_extractions')
        .select('solicitud_id, qr_data, sat_result, duplicate_detected, extraction_method, extracted_at')
        .in('solicitud_id', solIds)
        .order('extracted_at', { ascending: false })
      for (const c of cfdis ?? []) {
        if (!cfdiMap.has(c.solicitud_id)) cfdiMap.set(c.solicitud_id, c as never)
      }
    }

    // Fetch overrides
    const findingIds = (allFindings ?? []).map((f) => f.id).filter(Boolean)
    let overrideMap = new Map<string, string>()
    if (findingIds.length > 0) {
      const { data: overrides } = await supabase
        .from('quality_overrides')
        .select('finding_id, decision')
        .in('finding_id', findingIds)
      for (const o of overrides ?? []) overrideMap.set(o.finding_id, o.decision)
    }

    // Build per-policy inputs
    const policies: PolicyReportInput[] = []
    for (const [solicitudId, findings] of bySOL.entries()) {
      const sol = solMap.get(solicitudId)
      const cfdi = cfdiMap.get(solicitudId) ?? null
      const qr = cfdi?.qr_data as Record<string, unknown> | null
      const sat = cfdi?.sat_result as Record<string, unknown> | null

      const qrFindings: QualityReportFinding[] = (findings ?? []).map((f) => ({
        severity: f.severity as 'stop' | 'flag' | 'info',
        category: f.category ?? '',
        rule_code: f.rule_code ?? '',
        title: f.title ?? '',
        detail: f.detail,
        detected_at: f.detected_at,
        resolved_at: f.resolved_at,
        resolution_notes: f.resolution_notes,
        cfdi: (f.category === 'cfdi' || f.category === 'cfdi_duplicate') && cfdi ? {
          uuid: qr?.uuid as string | undefined,
          rfc_emisor: qr?.rfc_emisor as string | undefined,
          rfc_receptor: qr?.rfc_receptor as string | undefined,
          total: qr?.total as string | undefined,
          sat_status: sat?.status as string | undefined,
          sat_cancel_reason: sat?.cancel_reason as string | undefined,
          duplicate_detected: cfdi.duplicate_detected,
          extraction_method: cfdi.extraction_method,
          extracted_at: cfdi.extracted_at,
        } : null,
      }))

      const approvedCount = (findings ?? []).filter((f) => overrideMap.get(f.id) === 'approve').length
      const rejectedCount = (findings ?? []).filter((f) => overrideMap.get(f.id) === 'reject').length

      policies.push({
        solicitudId,
        folio: sol?.folio ?? null,
        policy_number: (findings ?? []).find((f) => f.policy_number)?.policy_number ?? null,
        agent_id: sol?.clave_agente ?? (findings ?? [])[0]?.agent_id ?? null,
        dependencia: sol?.dependencia ?? (findings ?? [])[0]?.dependencia ?? null,
        contratante_name: sol ? `${sol.contratante_nombres ?? ''} ${sol.contratante_ap_paterno ?? ''}`.trim() : null,
        generated_at,
        findings: qrFindings,
        override_summary: {
          total_overrides: approvedCount + rejectedCount,
          approved: approvedCount,
          rejected: rejectedCount,
        },
      })
    }

    // Also include solicitudes with no findings (clean)
    // For batch we only include those with at least one finding unless there's a narrow scope
    // (to avoid huge empty reports)

    const totalStops = policies.reduce((acc, p) => acc + p.findings.filter((f) => f.severity === 'stop').length, 0)
    const totalFlags = policies.reduce((acc, p) => acc + p.findings.filter((f) => f.severity === 'flag').length, 0)
    const totalOverrides = policies.reduce((acc, p) => acc + (p.override_summary?.total_overrides ?? 0), 0)

    // Build period label
    const periodParts: string[] = []
    if (from) periodParts.push(`desde ${from}`)
    if (to) periodParts.push(`hasta ${to}`)
    if (dependencia) periodParts.push(`dep: ${dependencia}`)
    if (agent_id) periodParts.push(`agente: ${agent_id}`)

    const input: BatchReportInput = {
      generated_at,
      period_label: periodParts.length > 0 ? periodParts.join(' · ') : 'Todo el histórico',
      policies,
      totals: {
        total_policies: policies.length,
        total_stops: totalStops,
        total_flags: totalFlags,
        total_overrides: totalOverrides,
        clean_policies: policies.filter((p) => p.findings.length === 0).length,
      },
    }

    const pdfBuffer = await buildBatchQualityPdf(input)
    const datePart = new Date().toISOString().slice(0, 10)
    const filename = `calidad-batch-${datePart}.pdf`

    return new Response(pdfBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[quality/report/batch] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error generating batch quality report' },
      { status: 500 }
    )
  }
}
