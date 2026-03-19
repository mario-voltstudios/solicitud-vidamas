/**
 * GET /api/quality/report/policy/[id]
 * Returns a quality certificate PDF for a single solicitud/policy.
 * Pulls real findings, CFDI evidence, and override data from DB.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  buildPolicyQualityPdf,
  type PolicyReportInput,
  type QualityReportFinding,
} from '@/lib/quality-report-pdf'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()
    const generated_at = new Date().toISOString()

    // Resolve solicitud metadata
    const { data: sol } = await supabase
      .from('solicitudes')
      .select('id, folio, contratante_nombres, contratante_ap_paterno, clave_agente, dependencia')
      .eq('id', id)
      .maybeSingle()

    // Fetch quality findings for this solicitud
    const { data: rawFindings } = await supabase
      .from('quality_findings')
      .select('id, severity, category, rule_code, title, detail, detected_at, resolved_at, resolution_notes, evidence, policy_number')
      .eq('solicitud_id', id)
      .order('detected_at', { ascending: false })

    // Fetch CFDI extractions for this solicitud
    const { data: cfdiRows } = await supabase
      .from('cfdi_extractions')
      .select('id, qr_data, sat_result, duplicate_detected, extraction_method, extracted_at')
      .eq('solicitud_id', id)
      .order('extracted_at', { ascending: false })
      .limit(5)

    // Build CFDI map by finding evidence uuid
    const latestCfdi = cfdiRows?.[0] ?? null

    const findings: QualityReportFinding[] = (rawFindings ?? []).map((f) => {
      const ev = f.evidence as Record<string, unknown> | null
      // Try to match CFDI evidence from finding or latest extraction
      const cfdiMatch = latestCfdi ?? null
      const qr = cfdiMatch?.qr_data as Record<string, unknown> | null
      const sat = cfdiMatch?.sat_result as Record<string, unknown> | null

      return {
        severity: f.severity as 'stop' | 'flag' | 'info',
        category: f.category ?? '',
        rule_code: f.rule_code ?? '',
        title: f.title ?? '',
        detail: f.detail,
        detected_at: f.detected_at,
        resolved_at: f.resolved_at,
        resolution_notes: f.resolution_notes,
        cfdi: (f.category === 'cfdi' || f.category === 'cfdi_duplicate') && cfdiMatch ? {
          uuid: qr?.uuid as string | undefined,
          rfc_emisor: qr?.rfc_emisor as string | undefined,
          rfc_receptor: qr?.rfc_receptor as string | undefined,
          total: qr?.total as string | undefined,
          sat_status: sat?.status as string | undefined,
          sat_cancel_reason: sat?.cancel_reason as string | undefined,
          duplicate_detected: cfdiMatch.duplicate_detected ?? false,
          extraction_method: cfdiMatch.extraction_method ?? undefined,
          extracted_at: cfdiMatch.extracted_at ?? undefined,
        } : ev?.cfdi_extraction ? {
          // inline CFDI from finding evidence
          uuid: (ev.cfdi_extraction as Record<string, unknown>)?.uuid as string | undefined,
          sat_status: undefined, // not available inline
        } : null,
      }
    })

    // Override summary
    const { data: overrides } = await supabase
      .from('quality_overrides')
      .select('id, decision')
      .in(
        'finding_id',
        (rawFindings ?? []).map((f) => f.id).filter(Boolean)
      )

    const approved = (overrides ?? []).filter((o) => o.decision === 'approve').length
    const rejected = (overrides ?? []).filter((o) => o.decision === 'reject').length

    const policyNumber = (rawFindings ?? []).find((f) => f.policy_number)?.policy_number ?? null
    const contratanteName = sol
      ? `${sol.contratante_nombres ?? ''} ${sol.contratante_ap_paterno ?? ''}`.trim()
      : null

    const input: PolicyReportInput = {
      solicitudId: id,
      folio: sol?.folio ?? null,
      policy_number: policyNumber,
      agent_id: sol?.clave_agente ?? null,
      dependencia: sol?.dependencia ?? null,
      contratante_name: contratanteName,
      generated_at,
      findings,
      override_summary: {
        total_overrides: (overrides ?? []).length,
        approved,
        rejected,
      },
    }

    const pdfBuffer = await buildPolicyQualityPdf(input)
    const filename = `calidad-${sol?.folio ?? id.slice(0, 8)}.pdf`

    return new Response(pdfBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[quality/report/policy] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error generating quality report' },
      { status: 500 }
    )
  }
}
