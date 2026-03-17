// ⚠️  DEPRECATED 2026-03-17 — canonical copy is lib/filtro-calidad/prompt-runner.ts
// This file is kept only for git history.

// ============================================================
// Filtro de Calidad v1 — Plain-Language Prompt Runner
// Created: 2026-03-16
//
// Translates natural-language requests into RunScope structs
// and delegates to runRetroFiltro.
//
// Examples:
//   parseRunScope("Run filtro calidad for all pólizas in February")
//   parseRunScope("Run filtro calidad for agent ABC123 last 365 days")
//   parseRunScope("Run filtro calidad for policy numbers 123, 456")
//   parseRunScope("Show only hard stops for GOB CDMX last 90 days")
// ============================================================

import type { RunScope } from './types'

// ──────────────────────────────────────────────────────────────
// Quick deterministic parser — no LLM needed for common patterns
// The LLM (Jarvis) should call parseRunScope() to get a scope
// struct, then call runRetroFiltro(scope, supabase).
// ──────────────────────────────────────────────────────────────
export function parseRunScope(input: string): RunScope & { hard_stops_only?: boolean } {
  const lower = input.toLowerCase()
  const hard_stops_only = lower.includes('hard stop') || lower.includes('solo paradas') || lower.includes('solo bloqueadas')

  // Policy numbers: "for policy numbers X, Y, Z"
  const policyMatch = lower.match(/for policy (?:numbers?|#s?)\s*([\d\w,\s-]+)/i)
  if (policyMatch) {
    const policy_numbers = policyMatch[1].split(/[,\s]+/).map((s: string) => s.trim()).filter(Boolean)
    return { type: 'policy', policy_numbers, hard_stops_only }
  }

  // Folio: "for folio 5156-2026-S08-01"
  const folioMatch = input.match(/folio\s+([\w-]+)/i)
  if (folioMatch) {
    return { type: 'folio', folio: folioMatch[1], hard_stops_only }
  }

  // Agent: "for agent(s) ABC123 [, DEF456] [last N days]"
  const agentMatch = lower.match(/for agents?\s+([\w,\s]+?)(?:\s+last|\s+from|\s*$)/i)
  if (agentMatch) {
    const agent_ids = agentMatch[1].split(/[,\s]+/).map((s: string) => s.trim().toUpperCase()).filter(Boolean)
    const { from, to } = extractDateRange(lower)
    return { type: 'agent', agent_ids, from, to, hard_stops_only }
  }

  // Dependencia: "for GOB CDMX" / "for IMSS" / "for SEP"
  const depMatch = lower.match(/for (gob\s*cdmx|imss|issste|sep|cfE|pemex)/i)
  if (depMatch) {
    const { from, to } = extractDateRange(lower)
    return { type: 'dependencia', dependencia: depMatch[1].toUpperCase().replace(/\s+/, ' '), from, to, hard_stops_only }
  }

  // Date range: "for all pólizas in February" / "last 90 days" / "in 2026-02" / "from X to Y"
  const { from, to } = extractDateRange(lower)
  return { type: 'date_range', from, to, hard_stops_only }
}

// ──────────────────────────────────────────────────────────────
// Date range extractor
// ──────────────────────────────────────────────────────────────
function extractDateRange(input: string): { from?: string; to?: string } {
  const now = new Date()

  // "last N days"
  const lastNDays = input.match(/last\s+(\d+)\s+days?/)
  if (lastNDays) {
    const days = parseInt(lastNDays[1])
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    return { from, to: now.toISOString().split('T')[0] }
  }

  // "in February" / "in March" etc.
  const monthNames: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  }
  for (const [name, month] of Object.entries(monthNames)) {
    if (input.includes(name)) {
      const year = now.getFullYear()
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
      return { from, to }
    }
  }

  // "in YYYY-MM"
  const yearMonthMatch = input.match(/(\d{4})-(\d{2})/)
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1])
    const month = parseInt(yearMonthMatch[2])
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
    return { from, to }
  }

  return {}
}