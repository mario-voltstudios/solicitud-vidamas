// ============================================================
// CFDI QR URL Parser
// lib/cfdi/qr-extractor.ts
// Created: 2026-03-19
//
// Extracts CFDI data from SAT QR URLs embedded in talones de pago.
//
// Primary path: image/PDF → OCR returns QR URL text →
//   parseSATQRUrl(url) → CFDIQRData
//
// The actual image-to-QR-text step happens in:
//   - Phase 1 (this file): parse the URL if already extracted
//   - Phase 2 (TODO): decode QR from image using a QR decoder
//   - Phase 3 (TODO): OCR fallback for damaged/missing QR
//
// SAT QR URL structure:
//   https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx
//     ?id=<UUID>&re=<RFC_EMISOR>&rr=<RFC_RECEPTOR>&tt=<TOTAL>&fe=<SELLO_TAIL>
// ============================================================

import type { CFDIQRData } from './types'

const SAT_QR_HOSTS = [
  'verificacfdi.facturaelectronica.sat.gob.mx',
  'pacvsfacturav3.sat.gob.mx', // legacy host
]

// UUID pattern: 8-4-4-4-12 hex chars (case-insensitive)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ──────────────────────────────────────────────────────────────
// Parse a SAT QR URL into its component fields
// Returns null if the URL is not a valid SAT CFDI QR URL
// ──────────────────────────────────────────────────────────────
export function parseSATQRUrl(raw: string): CFDIQRData | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }

  const isKnownHost = SAT_QR_HOSTS.some(
    (h) => url.hostname === h || url.hostname.endsWith(`.${h}`)
  )
  // Also accept URLs where the path contains 'verificacfdi' as a safety net
  const looksLikeSAT = isKnownHost || url.href.includes('verificacfdi')
  if (!looksLikeSAT) return null

  const id = url.searchParams.get('id')
  const re = url.searchParams.get('re')
  const rr = url.searchParams.get('rr')
  const tt = url.searchParams.get('tt')
  const fe = url.searchParams.get('fe')

  if (!id || !UUID_RE.test(id)) return null
  if (!re) return null
  if (!rr) return null

  return {
    uuid: id.toUpperCase(),
    rfc_emisor: re.toUpperCase().trim(),
    rfc_receptor: rr.toUpperCase().trim(),
    total: tt ?? '0.00',
    sello_tail: fe ?? '',
    source_url: raw.trim(),
  }
}

// ──────────────────────────────────────────────────────────────
// Scan a block of text (e.g. OCR output) for SAT QR URLs
// Returns the first valid hit, or null
// ──────────────────────────────────────────────────────────────
export function extractQRFromText(text: string): CFDIQRData | null {
  if (!text) return null

  // Look for URLs that look like SAT verification links
  // Matches both: https://verificacfdi... and embedded URLs containing verificacfdi
  const urlPattern = /https?:\/\/(?:[^\s"'<>]*\.)?(?:verificacfdi|facturaelectronica\.sat)[^\s"'<>]*/gi
  const matches = text.match(urlPattern)
  if (!matches) return null

  for (const match of matches) {
    const parsed = parseSATQRUrl(match)
    if (parsed) return parsed
  }
  return null
}

// ──────────────────────────────────────────────────────────────
// Extract UUID from plain text (fallback: talon might have UUID
// printed as text without a full URL)
// Returns the first UUID-shaped string found, or null.
// ──────────────────────────────────────────────────────────────
export function extractUUIDFromText(text: string): string | null {
  if (!text) return null
  const match = text.match(
    /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i
  )
  return match ? match[1].toUpperCase() : null
}

// ──────────────────────────────────────────────────────────────
// Validate UUID format (standalone utility)
// ──────────────────────────────────────────────────────────────
export function isValidCFDIUUID(value: string): boolean {
  return UUID_RE.test(value.trim())
}
