// ============================================================
// POST /api/quality/retro-run
// Triggers a retroactive Filtro de Calidad scan.
//
// Body (JSON):
//   { scope: RunScope, secret: string }
//
// scope examples:
//   { type: "date_range", from: "2026-01-01", to: "2026-03-31" }
//   { type: "agent", agent_ids: ["ABC123"], from: "...", to: "..." }
//   { type: "folio", folio: "7063-2025-S51-01" }
//
// Returns: { run_id, summary }
// Protected by MARIO_OVERRIDE_SECRET env var.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { runRetroFiltro } from '@/lib/filtro-calidad/retro-runner'
import type { RunScope } from '@/lib/filtro-calidad/types'

export const maxDuration = 300 // 5 min

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const secret = process.env.MARIO_OVERRIDE_SECRET
  if (secret && body.secret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const scope = body.scope as RunScope | undefined
  if (!scope?.type) {
    return NextResponse.json({ error: 'scope.type required' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const result = await runRetroFiltro(scope, supabase, 'mario')
    return NextResponse.json({
      run_id: result.run_id,
      scope: result.scope,
      summary: result.summary,
      action_queue_count: result.action_queue.length,
    })
  } catch (err) {
    console.error('[retro-run]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
