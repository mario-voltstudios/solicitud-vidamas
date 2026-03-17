// ============================================================
// API: POST /api/quality/ingest-emails
// Trigger email ingestion from Gmail → email_policy_events.
//
// Auth: MARIO_OVERRIDE_SECRET bearer token (same secret).
// Body: { days?: number, dryRun?: boolean }
//
// This route runs the same logic as scripts/ingest-emails.ts
// but as a Next.js API route (for Vercel cron or manual trigger).
//
// Vercel Cron config (vercel.json):
//   { "crons": [{ "path": "/api/quality/ingest-emails", "schedule": "0 */6 * * *" }] }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { google } from 'googleapis'
import { scanEmailsForPolicies } from '@/lib/filtro-calidad/email-intel'
import type { RawEmailMessage } from '@/lib/filtro-calidad/email-intel'
import type { EmailPolicyEvent } from '@/lib/filtro-calidad/types'

const MARIO_OVERRIDE_SECRET = process.env.MARIO_OVERRIDE_SECRET ?? ''
const MARIO_EMAIL = 'mario@veseguro.com'

function authError() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

function stripLeadingZeros(pn: string): string {
  if (!pn) return ''
  return pn.replace(/^0+(?=\d)/, '')
}

function decodeBody(payload: Record<string, unknown>): string {
  if (!payload) return ''
  type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] }

  function extractText(part: Part): string {
    if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
      const data = part.body?.data ?? ''
      return Buffer.from(data, 'base64url').toString('utf8')
    }
    if (part.parts) return part.parts.map(extractText).join('\n')
    return ''
  }

  const p = payload as Part
  if (p.parts) return p.parts.map(extractText).join('\n')
  if (p.body?.data) return Buffer.from(p.body.data, 'base64url').toString('utf8')
  return ''
}

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization') ?? ''
  // Allow Vercel cron (no auth header) OR bearer token
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (!isCron) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!MARIO_OVERRIDE_SECRET || token !== MARIO_OVERRIDE_SECRET) return authError()
  }

  let days = 7
  let dryRun = false
  try {
    const body = await req.json().catch(() => ({}))
    days = (body as Record<string, number>).days ?? 7
    dryRun = !!(body as Record<string, boolean>).dryRun
  } catch {}

  const supabase = createServerClient()

  // 1. Get SA credentials
  let saJson: Record<string, unknown>
  const saEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ''
  if (!saEnv || saEnv === 'placeholder_will_be_set_on_vercel') {
    return NextResponse.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' }, { status: 503 })
  }
  try {
    saJson = saEnv.startsWith('{') ? JSON.parse(saEnv) : JSON.parse(Buffer.from(saEnv, 'base64').toString())
  } catch {
    return NextResponse.json({ error: 'Invalid GOOGLE_SERVICE_ACCOUNT_JSON' }, { status: 503 })
  }

  // 2. Build Gmail client
  const auth = new google.auth.JWT({
    email: saJson.client_email as string,
    key: saJson.private_key as string,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    subject: MARIO_EMAIL,
  })
  const gmail = google.gmail({ version: 'v1', auth })

  // 3. Get policy numbers
  const { data: polizas } = await supabase
    .from('polizas')
    .select('numero_poliza')
    .not('numero_poliza', 'is', null)
    .limit(5000)

  const policyNumbers = (polizas ?? [])
    .map((p: Record<string, string>) => stripLeadingZeros(p.numero_poliza))
    .filter(Boolean)

  if (policyNumbers.length === 0) {
    return NextResponse.json({ ok: true, message: 'No policy numbers found', events: 0 })
  }

  // 4. Already ingested IDs
  const { data: ingested } = await supabase
    .from('email_policy_events')
    .select('source_message_id')
    .limit(10000)
  const alreadyIngested = new Set((ingested ?? []).map((r: Record<string, string>) => r.source_message_id))

  // 5. Fetch Gmail
  const afterDate = new Date()
  afterDate.setDate(afterDate.getDate() - days)
  const afterEpoch = Math.floor(afterDate.getTime() / 1000)
  const query = `in:inbox after:${afterEpoch}`

  const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 100 })
  const msgs = listRes.data.messages ?? []

  const allMessages: RawEmailMessage[] = []
  for (const { id } of msgs) {
    if (!id || alreadyIngested.has(id)) continue
    try {
      const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
      const headers = full.data.payload?.headers ?? []
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value ?? ''
      const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value ?? ''
      const dateStr = headers.find(h => h.name?.toLowerCase() === 'date')?.value ?? ''
      const body = decodeBody((full.data.payload ?? {}) as Record<string, unknown>)
      allMessages.push({ messageId: id, subject, from, body: body.slice(0, 5000), receivedAt: dateStr ? new Date(dateStr) : new Date() })
    } catch { /* skip */ }
  }

  // 6. Scan + upsert
  const eventMap = scanEmailsForPolicies(allMessages, policyNumbers)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allEvents: any[] = []
  for (const events of eventMap.values()) {
    for (const ev of events) {
      allEvents.push({ ...ev, occurred_at: ev.occurred_at instanceof Date ? ev.occurred_at.toISOString() : ev.occurred_at as string })
    }
  }

  if (!dryRun && allEvents.length > 0) {
    await supabase.from('email_policy_events').upsert(allEvents, { onConflict: 'source_message_id,event_type' })
  }

  return NextResponse.json({
    ok: true,
    messages_scanned: allMessages.length,
    policy_numbers_checked: policyNumbers.length,
    events_detected: allEvents.length,
    dry_run: dryRun,
    summary: Object.fromEntries([...eventMap.entries()].map(([k, v]) => [k, v.map(e => e.event_type)])),
  })
}
