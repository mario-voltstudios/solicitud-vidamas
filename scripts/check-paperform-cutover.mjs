#!/usr/bin/env node
// check-paperform-cutover.mjs
//
// Read-only cutover smoke check for replacing Paperform with the Next.js
// solicitud intake. It verifies the current Paperform sync/ETL backlog is empty
// and that the production Supabase RPC/view needed for rollback/reporting are reachable.
//
// Usage:
//   node scripts/check-paperform-cutover.mjs
//   node scripts/check-paperform-cutover.mjs --since=2026-04-01
//
// Env:
//   SUPABASE_URL + SUPABASE_KEY, or ASTRO_SUPABASE_URL + ASTRO_SUPABASE_KEY.
//   Falls back to ~/.openclaw/.env when present.
//
// Safety:
//   - No inserts/updates/deletes.
//   - The only POST is fn_backfill_all_paperform with p_dry_run=true.

import fs from 'node:fs'
import path from 'node:path'

function loadEnv() {
  if ((process.env.SUPABASE_URL || process.env.ASTRO_SUPABASE_URL) &&
      (process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.ASTRO_SUPABASE_KEY)) {
    return
  }

  const envPath = path.join(process.env.HOME || '/home/clawd', '.openclaw/.env')
  if (!fs.existsSync(envPath)) return

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

loadEnv()

const args = process.argv.slice(2)
const since = (args.find((arg) => arg.startsWith('--since=')) || '--since=2026-04-01').split('=')[1]
const SB_URL = process.env.ASTRO_SUPABASE_URL || process.env.SUPABASE_URL
const SB_KEY = process.env.ASTRO_SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY

if (!SB_URL || !SB_KEY) {
  console.error('missing SUPABASE_URL/SUPABASE_KEY (or ASTRO_SUPABASE_URL/ASTRO_SUPABASE_KEY)')
  process.exit(2)
}

async function sbFetch(pathWithQuery, options = {}) {
  const response = await fetch(`${SB_URL}${pathWithQuery}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathWithQuery} -> HTTP ${response.status}: ${text.slice(0, 300)}`)
  }
  return { response, body: text ? JSON.parse(text) : null }
}

async function countRows(label, pathWithQuery, expectedCount) {
  const { response } = await sbFetch(pathWithQuery, {
    headers: { Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' },
  })
  const contentRange = response.headers.get('content-range') || '*/0'
  const count = Number(contentRange.split('/').pop() || 0)
  const ok = expectedCount === undefined ? Number.isFinite(count) : count === expectedCount
  return { label, ok, count, expectedCount }
}

function printCheck(result) {
  const mark = result.ok ? '✅' : '❌'
  const expected = result.expectedCount === undefined ? '' : ` (expected ${result.expectedCount})`
  console.log(`  ${mark} ${result.label}: ${result.count}${expected}`)
}

async function main() {
  console.log('== Paperform cutover readiness smoke ==')
  console.log(`supabase: ${SB_URL}`)
  console.log(`stranded cutoff: ${since}`)

  const checks = []

  checks.push(await countRows(
    `stranded Paperform rows since ${since} (numero_solicitud IS NULL)`,
    `/rest/v1/solicitudes_paperform?select=id&created_at=gte.${encodeURIComponent(since)}&numero_solicitud=is.null`,
    0,
  ))

  checks.push(await countRows(
    'migratable Paperform backlog (unmerged, raw_data present, non-demo)',
    '/rest/v1/solicitudes_paperform?select=id&merged_to_solicitud_id=is.null&raw_data=not.is.null&id=not.like.demo-*',
    0,
  ))

  const knownExceptions = await countRows(
    'known non-migratable exceptions (unmerged demo/null-raw_data rows)',
    '/rest/v1/solicitudes_paperform?select=id&merged_to_solicitud_id=is.null&or=(raw_data.is.null,id.like.demo-*)',
    undefined,
  )
  knownExceptions.ok = true
  checks.push(knownExceptions)

  const unified = await countRows(
    'v_solicitudes_unified reachable',
    '/rest/v1/v_solicitudes_unified?select=id',
    undefined,
  )
  unified.ok = Number.isFinite(unified.count)
  checks.push(unified)

  const canonical = await countRows(
    'canonical solicitudes table reachable',
    '/rest/v1/solicitudes?select=id',
    undefined,
  )
  canonical.ok = Number.isFinite(canonical.count)
  checks.push(canonical)

  console.log('\n[database state]')
  for (const check of checks) printCheck(check)

  console.log('\n[rpc dry-run]')
  const rpc = await sbFetch('/rest/v1/rpc/fn_backfill_all_paperform', {
    method: 'POST',
    body: JSON.stringify({ p_dry_run: true, p_limit: 1 }),
  })
  console.log(`  ${rpc.response.ok ? '✅' : '❌'} fn_backfill_all_paperform p_dry_run=true: HTTP ${rpc.response.status}`)

  const failures = checks.filter((check) => !check.ok)
  if (failures.length > 0) {
    console.error('\nCutover smoke failed:')
    for (const failure of failures) {
      console.error(`  - ${failure.label}: ${failure.count} (expected ${failure.expectedCount})`)
    }
    process.exit(1)
  }

  console.log('\nPASS: Paperform sync/ETL backlog is clean from the app cutover perspective.')
}

main().catch((error) => {
  console.error('fatal:', error.message)
  process.exit(2)
})
