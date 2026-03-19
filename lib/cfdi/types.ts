// ============================================================
// CFDI Validation — Core Types
// lib/cfdi/types.ts
// Created: 2026-03-19
//
// Covers the data structures for:
//   1. Parsed CFDI QR URL fields
//   2. SAT verification request/response
//   3. Persisted cfdi_extractions row
//
// SAT QR URL format (nomina / talones de pago):
//   https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx
//     ?id={UUID}       — CFDI UUID (36-char, e.g. XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX)
//     &re={RFC_emisor} — RFC of the emisor (employer)
//     &rr={RFC_receptor} — RFC of the receptor (employee)
//     &tt={total}      — Total amount as decimal string (e.g. "0.00" for nómina)
//     &fe={sello_tail} — Last 8 chars of the sello digital
// ============================================================

// ──────────────────────────────────────────────────────────────
// Raw data parsed from a SAT QR URL
// ──────────────────────────────────────────────────────────────
export interface CFDIQRData {
  /** CFDI UUID, uppercase, e.g. "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" */
  uuid: string
  /** RFC of the emisor (employer) */
  rfc_emisor: string
  /** RFC of the receptor (employee) — may be "XAXX010101000" for generic */
  rfc_receptor: string
  /** Total in the CFDI (nómina CFDIs often have total = 0) */
  total: string
  /** Last 8 chars of sello digital (integrity check) */
  sello_tail: string
  /** Raw QR URL for audit */
  source_url: string
}

// ──────────────────────────────────────────────────────────────
// SAT verification response
// ──────────────────────────────────────────────────────────────
export type SATCFDIStatus =
  | 'Vigente'       // Valid and active
  | 'Cancelado'     // Cancelled
  | 'No Encontrado' // Not found in SAT registry
  | 'error'         // Communication/parse error

export interface SATVerifyRequest {
  uuid: string
  rfc_emisor: string
  rfc_receptor: string
  total: string
  sello_tail?: string
}

export interface SATVerifyResult {
  /** Whether we were able to reach SAT and get a valid response */
  reachable: boolean
  /** SAT-reported status */
  status: SATCFDIStatus
  /** SAT cancellation reason if status === 'Cancelado' */
  cancel_reason?: string
  /** Raw SAT response text (for audit) */
  raw_response?: string
  /** Error message if reachable=false */
  error?: string
  /** Timestamp of verification */
  verified_at: string
}

// ──────────────────────────────────────────────────────────────
// Persisted row in cfdi_extractions table
// ──────────────────────────────────────────────────────────────
export interface CFDIExtraction {
  id?: string
  /** FK to solicitudes(id) if known */
  solicitud_id?: string | null
  /** FK to quality_runs(id) if triggered from a run */
  quality_run_id?: string | null
  /** Storage path of the source document (talon/PDF) */
  source_doc_path: string
  /** Extraction method used */
  extraction_method: 'qr_url' | 'ocr_fallback' | 'manual'
  /** Parsed QR data — null if extraction failed */
  qr_data?: CFDIQRData | null
  /** SAT verification result — null if not yet verified */
  sat_result?: SATVerifyResult | null
  /** Whether UUID duplicate was detected across other solicitudes */
  duplicate_detected: boolean
  /** UUID(s) of duplicate solicitudes if any */
  duplicate_solicitud_ids?: string[]
  /** ISO timestamp */
  extracted_at: string
  /** Warnings from extraction (e.g. QR not found, OCR low confidence) */
  warnings?: string[]
}

// ──────────────────────────────────────────────────────────────
// Result returned by the CFDI validation pipeline
// ──────────────────────────────────────────────────────────────
export type CFDIValidationStatus =
  | 'valid'            // UUID extracted, SAT says Vigente, no duplicate
  | 'cancelled'        // SAT says Cancelado — hard stop
  | 'duplicate'        // Same UUID found in another solicitud — hard stop
  | 'not_found'        // Not in SAT registry — flag
  | 'sat_unreachable'  // Could not verify with SAT — flag
  | 'extraction_failed'// QR not found, OCR failed — flag
  | 'skipped'          // No talon doc attached — info

export interface CFDIValidationResult {
  status: CFDIValidationStatus
  extraction?: CFDIExtraction
  /** Human-readable summary for findings detail field */
  summary: string
}
