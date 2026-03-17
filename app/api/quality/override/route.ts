// ============================================================
// API: POST /api/quality/override
// Mario-only endpoint to approve or reject a quality finding.
//
// Auth: Validated via MARIO_OVERRIDE_SECRET env var (bearer token).
//       In production, replace with Supabase auth.uid() check.
//
// Body (JSON):
//   {
//     finding_id: string,   // uuid of quality_findings row
//     decision: "approved" | "rejected",
//     reason: string,       // mandatory — min 10 chars
//     notes?: string        // optional additional context
//   }
//
// Response 200:
//   { override_id: string, finding_id: string, decision: string }
//
// Response 400/401/403/404/409: error message
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const MARIO_OVERRIDE_SECRET = process.env.MARIO_OVERRIDE_SECRET ?? ''

function authError() {
  return NextResponse.json({ error: 'Unauthorized — Mario override token required' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  // -- Auth: bearer token check --
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!MARIO_OVERRIDE_SECRET || token !== MARIO_OVERRIDE_SECRET) {
    return authError()
  }

  // -- Parse body --
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { finding_id, decision, reason, notes } = body as Record<string, string>

  if (!finding_id) return NextResponse.json({ error: 'finding_id is required' }, { status: 400 })
  if (!decision || !['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be "approved" or "rejected"' }, { status: 400 })
  }
  if (!reason || reason.trim().length < 10) {
    return NextResponse.json({ error: 'reason is required (min 10 characters)' }, { status: 400 })
  }

  // -- Supabase upsert --
  const supabase = createServerClient()

  // Verify finding exists
  const { data: finding, error: findingErr } = await supabase
    .from('quality_findings')
    .select('id, severity, status_label, solicitud_id, policy_number')
    .eq('id', finding_id)
    .single()

  if (findingErr || !finding) {
    return NextResponse.json({ error: 'Finding not found' }, { status: 404 })
  }

  // Insert override (unique constraint on finding_id prevents duplicates)
  const { data: overrideRow, error: overrideErr } = await supabase
    .from('quality_overrides')
    .insert({
      finding_id,
      decision,
      reason: reason.trim(),
      notes: notes?.trim() ?? null,
      overridden_by: 'mario',
      overridden_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (overrideErr) {
    if (overrideErr.code === '23505') {
      // Unique violation — override already exists
      return NextResponse.json(
        { error: 'Override already recorded for this finding. Cannot override twice.' },
        { status: 409 }
      )
    }
    console.error('[override] DB error:', overrideErr)
    return NextResponse.json({ error: 'Database error — override not saved' }, { status: 500 })
  }

  // Update quality_findings.resolved_at + resolution_notes
  await supabase
    .from('quality_findings')
    .update({
      resolved_at: new Date().toISOString(),
      resolution_notes: `Override [${decision.toUpperCase()}] by mario — ${reason.trim()}`,
    })
    .eq('id', finding_id)

  // Refresh policy_quality_state if applicable
  if (finding.solicitud_id || finding.policy_number) {
    // Recount open hard stops for this case
    const filterKey = finding.solicitud_id ? 'solicitud_id' : 'policy_number'
    const filterVal = finding.solicitud_id ?? finding.policy_number

    const { data: openStops } = await supabase
      .from('quality_findings')
      .select('id')
      .eq(filterKey, filterVal)
      .eq('severity', 'stop')
      .is('resolved_at', null)

    const openStopCount = openStops?.length ?? 0
    const newState = openStopCount === 0 ? 'approved_for_emision' : 'pending_manual_review'

    const upsertKey: Record<string, string | null> = {}
    upsertKey[filterKey] = filterVal
    // Set the other key to null if not available
    if (filterKey === 'solicitud_id') upsertKey['policy_number'] = finding.policy_number ?? null
    else upsertKey['solicitud_id'] = finding.solicitud_id ?? null

    await supabase
      .from('policy_quality_state')
      .update({
        overall_state: newState,
        hard_stop_count: openStopCount,
        override_required: openStopCount > 0,
        updated_at: new Date().toISOString(),
      })
      .eq(filterKey, filterVal)
  }

  return NextResponse.json({
    override_id: overrideRow?.id,
    finding_id,
    decision,
    message: `Override [${decision.toUpperCase()}] recorded for finding ${finding_id}`,
  })
}
