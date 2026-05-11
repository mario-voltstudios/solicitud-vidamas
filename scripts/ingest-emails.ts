#!/usr/bin/env tsx
// ============================================================
// Email Ingestion Job — Filtro de Calidad
// scripts/ingest-emails.ts
//
// Reads Mario's Gmail (mario@veseguro.com) via Google Service Account
// with domain-wide delegation. Parses messages for policy signals
// and upserts into email_policy_events.
//
// USAGE:
//   npx tsx scripts/ingest-emails.ts [--days 7] [--dry-run]
//
// ENV VARS REQUIRED:
//   GOOGLE_SERVICE_ACCOUNT_JSON  — path to SA key file OR inline JSON
//   NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
//   SUPABASE_SECRET_KEY          — Supabase service role key
//
// MATCHING RULES (from bible):
//   - Scan Mario's inbox only (mario@veseguro.com)
//   - Policy-number-first matching: get active policy numbers from DB,
//     then scan each email for exact policy number presence.
//   - Strip leading zeros from policy numbers before matching.
//   - Do NOT process the same Gmail message ID twice (idempotent upsert).
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import {
  scanEmailsForPolicies,
  type RawEmailMessage,
} from '../lib/filtro-calidad/email-intel'
import type { EmailPolicyEvent } from '../lib/filtro-calidad/types'

type PersistedEmailPolicyEvent = Omit<EmailPolicyEvent, 'occurred_at'> & { occurred_at: string }

// ----------------------------------------------------------
// Args
// ----------------------------------------------------------
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const daysArg = args.find(a => a.startsWith('--days='))
const DAYS_BACK = daysArg ? parseInt(daysArg.split('=')[1]) : 7
const MARIO_EMAIL = 'mario@veseguro.com'
const MAX_RESULTS = 500  // Gmail API max per page

// ----------------------------------------------------------
// Setup
// ----------------------------------------------------------

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY')
  return createClient(url, key)
}

async function getGmailClient() {
  let saJson: Record<string, unknown>
  const saEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ''

  if (saEnv.startsWith('{')) {
    saJson = JSON.parse(saEnv)
  } else {
    // Treat as file path
    const path = saEnv || '/home/clawd/.openclaw/google-service-account.json'
    const { readFileSync } = await import('fs')
    saJson = JSON.parse(readFileSync(path, 'utf8'))
  }

  const auth = new google.auth.JWT({
    email: saJson.client_email as string,
    key: saJson.private_key as string,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    subject: MARIO_EMAIL,
  })

  return google.gmail({ version: 'v1', auth })
}

// ----------------------------------------------------------
// Fetch active policy numbers from DB
// ----------------------------------------------------------
async function getActivePolicyNumbers(supabase: SupabaseClient): Promise<string[]> {
  // Try polizas table first, fall back to solicitudes
  const { data: polizas } = await supabase
    .from('polizas')
    .select('numero_poliza')
    .not('numero_poliza', 'is', null)
    .limit(5000)

  if (polizas && polizas.length > 0) {
    return polizas
      .map((p: Record<string, string>) => stripLeadingZeros(p.numero_poliza))
      .filter(Boolean)
  }

  // Fallback: solicitudes with a policy number column
  const { data: sols } = await supabase
    .from('solicitudes')
    .select('numero_poliza')
    .not('numero_poliza', 'is', null)
    .limit(5000)

  return (sols ?? [])
    .map((s: Record<string, string>) => stripLeadingZeros(s.numero_poliza))
    .filter(Boolean)
}

function stripLeadingZeros(pn: string): string {
  if (!pn) return ''
  // Strip leading zeros but keep at least one digit
  return pn.replace(/^0+(?=\d)/, '')
}

// ----------------------------------------------------------
// Fetch already-ingested message IDs (idempotency)
// ----------------------------------------------------------
async function getIngestedMessageIds(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data } = await supabase
    .from('email_policy_events')
    .select('source_message_id')
    .limit(10000)

  return new Set((data ?? []).map((r: Record<string, string>) => r.source_message_id))
}

// ----------------------------------------------------------
// Decode Gmail message body
// ----------------------------------------------------------
function decodeBody(msg: { payload?: { parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>; body?: { data?: string }; mimeType?: string } }): string {
  const payload = msg.payload
  if (!payload) return ''

  function extractText(part: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }): string {
    if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
      const data = part.body?.data ?? ''
      return Buffer.from(data, 'base64url').toString('utf8')
    }
    if (part.parts) {
      return (part.parts as Array<typeof part>).map(extractText).join('\n')
    }
    return ''
  }

  if (payload.parts) {
    return payload.parts.map(extractText).join('\n')
  }
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8')
  }
  return ''
}

// ----------------------------------------------------------
// Main ingestion loop
// ----------------------------------------------------------
async function main() {
  console.log(`[ingest-emails] Starting — days_back=${DAYS_BACK} dry_run=${DRY_RUN}`)

  const supabase = getSupabase()
  const gmail = await getGmailClient()

  // 1. Fetch policy numbers
  const policyNumbers = await getActivePolicyNumbers(supabase)
  console.log(`[ingest-emails] Loaded ${policyNumbers.length} active policy numbers`)
  if (policyNumbers.length === 0) {
    console.warn('[ingest-emails] No policy numbers found — nothing to match against. Exiting.')
    process.exit(0)
  }

  // 2. Get already-ingested IDs
  const alreadyIngested = await getIngestedMessageIds(supabase)
  console.log(`[ingest-emails] ${alreadyIngested.size} messages already ingested`)

  // 3. Build Gmail query
  const afterDate = new Date()
  afterDate.setDate(afterDate.getDate() - DAYS_BACK)
  const afterEpoch = Math.floor(afterDate.getTime() / 1000)
  const query = `in:inbox after:${afterEpoch}`

  // 4. Fetch message list
  let pageToken: string | undefined
  const allMessages: RawEmailMessage[] = []
  let pageCount = 0

  do {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
      ...(pageToken ? { pageToken } : {}),
    })

    const msgs = listRes.data.messages ?? []
    pageToken = listRes.data.nextPageToken ?? undefined
    pageCount++

    console.log(`[ingest-emails] Page ${pageCount}: ${msgs.length} messages`)

    // Fetch full message for each
    for (const { id } of msgs) {
      if (!id) continue
      if (alreadyIngested.has(id)) continue

      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'full',
        })

        const headers = full.data.payload?.headers ?? []
        const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value ?? ''
        const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value ?? ''
        const dateStr = headers.find(h => h.name?.toLowerCase() === 'date')?.value ?? ''
        const body = decodeBody(full.data as Parameters<typeof decodeBody>[0])

        allMessages.push({
          messageId: id,
          subject,
          from,
          body: body.slice(0, 5000), // limit body size
          receivedAt: dateStr ? new Date(dateStr) : new Date(),
        })
      } catch (err) {
        console.warn(`[ingest-emails] Failed to fetch message ${id}:`, err)
      }
    }

    if (allMessages.length >= MAX_RESULTS) {
      console.log(`[ingest-emails] Reached max ${MAX_RESULTS} messages, stopping pagination`)
      break
    }
  } while (pageToken)

  console.log(`[ingest-emails] Fetched ${allMessages.length} new messages to parse`)

  // 5. Scan messages for policy signals
  const eventMap = scanEmailsForPolicies(allMessages, policyNumbers)

  let totalEvents = 0
  for (const [pn, events] of eventMap.entries()) {
    totalEvents += events.length
    console.log(`[ingest-emails] Policy ${pn}: ${events.length} events`)
  }

  console.log(`[ingest-emails] Total events detected: ${totalEvents}`)

  if (DRY_RUN) {
    console.log('[ingest-emails] DRY RUN — not persisting. Events:')
    for (const [pn, events] of eventMap.entries()) {
      for (const ev of events) {
        console.log(`  ${ev.event_type} — policy=${pn} msg=${ev.source_message_id} subject="${ev.raw_subject}"`)
      }
    }
    return
  }

  // 6. Upsert events into email_policy_events
  const allEvents: PersistedEmailPolicyEvent[] = []
  for (const events of eventMap.values()) {
    for (const ev of events) {
      allEvents.push({
        ...ev,
        occurred_at: ev.occurred_at instanceof Date ? ev.occurred_at.toISOString() : String(ev.occurred_at),
      })
    }
  }

  if (allEvents.length === 0) {
    console.log('[ingest-emails] No new events to persist.')
    return
  }

  // Upsert on source_message_id + event_type (unique together)
  const { error } = await supabase
    .from('email_policy_events')
    .upsert(allEvents, { onConflict: 'source_message_id,event_type' })

  if (error) {
    console.error('[ingest-emails] DB upsert error:', error)
    process.exit(1)
  }

  console.log(`[ingest-emails] ✅ Upserted ${allEvents.length} events into email_policy_events`)
}

main().catch(err => {
  console.error('[ingest-emails] Fatal error:', err)
  process.exit(1)
})
