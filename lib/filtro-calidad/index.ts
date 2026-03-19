// ============================================================
// Filtro de Calidad v1 — Canonical Module Entry Point
// lib/filtro-calidad/index.ts
// Updated: 2026-03-17 (consolidated from lib/quality/)
//
// CANONICAL PATH: lib/filtro-calidad/
// lib/quality/ is DEPRECATED — do not import from it directly.
//
// Structure:
//   types.ts          — shared types + RULE_CODES (snake_case, DB-aligned)
//   email-intel.ts    — parse Gmail messages → EmailPolicyEvent[]
//   expediente-sla.ts — SLA state derivation (5 biz-day window, MX holidays)
//   cancellation-rules.ts — cancellation state from email events
//   intake-hook.ts    — runIntakeFiltro() called from actions.ts
//   retro-runner.ts   — runRetroFiltro() for bulk/on-demand scans
//   prompt-runner.ts  — parseRunScope() natural-language → RunScope
// ============================================================

export * from './types'
export * from './email-intel'
export * from './expediente-sla'
export * from './mx-holidays'
export * from './cancellation-rules'
export * from './face-match'
export * from './video-ingest'
export * from './video-tamper'
export * from './intake-hook'
export * from './retro-runner'
export * from './prompt-runner'
