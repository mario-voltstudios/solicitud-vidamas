// ============================================================
// CFDI Validation Pipeline
// lib/cfdi/validate-cfdi.ts
// Created: 2026-03-19
//
// Main pipeline called from intake-hook and retro-runner.
//
// Flow:
//   1. Try to extract CFDI QR URL from OCR text of talon doc
//   2. Parse the SAT QR URL → CFDIQRData
//   3. Check for UUID duplicate in DB
//   4. Verify UUID with SAT (via pluggable validator)
//   5. Persist result to cfdi_extractions
//   6. Return CFDIValidationResult for findings generation
//
// NOTE: In v1 native QR decode is active. Pass `ocrText` to
//       skip the native decode step (e.g. if OCR is pre-done).
//       If ocrText is absent, the native QR decoder will attempt
//       to download and decode the talon doc directly.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractQRFromText, extractUUIDFromText } from './qr-extractor'
import { decodeQRFromDocPath } from './native-qr-decoder'
import { getSATValidator } from './sat-validator'
import type { CFDIExtraction, CFDIValidationResult, CFDIQRData } from './types'

export interface ValidateCFDIOptions {
  /** Supabase client (for dupe check + persist) */
  supabase: SupabaseClient
  /** Storage path to the talon/paystub document */
  talonPath: string
  /** FK to current solicitud (if known) */
  solicitudId?: string | null
  /** FK to current quality_run (if triggered from a run) */
  qualityRunId?: string | null
  /**
   * Pre-extracted OCR text from the talon.
   * In v1: pass this if you have it. If omitted and the OCR
   * provider is the stub, extraction will be skipped gracefully.
   */
  ocrText?: string
}

// ──────────────────────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────────────────────
export async function validateCFDI(opts: ValidateCFDIOptions): Promise<CFDIValidationResult> {
  const { supabase, talonPath, solicitudId, qualityRunId, ocrText } = opts
  const warnings: string[] = []

  // -- Step 1: Extract QR data --
  let qrData: CFDIQRData | null = null
  let extractionMethod: CFDIExtraction['extraction_method'] = 'qr_url'

  if (ocrText) {
    // Try parsing a full SAT QR URL from OCR output
    qrData = extractQRFromText(ocrText)

    if (!qrData) {
      // Fallback: look for a bare UUID in the OCR text
      const uuid = extractUUIDFromText(ocrText)
      if (uuid) {
        // We have a UUID but no full QR URL — treat as partial
        qrData = {
          uuid,
          rfc_emisor: '',
          rfc_receptor: '',
          total: '0.00',
          sello_tail: '',
          source_url: '',
        }
        extractionMethod = 'ocr_fallback'
        warnings.push('UUID extracted from text but full QR URL not found — SAT verification may be partial.')
      } else {
        warnings.push('No CFDI QR URL or UUID found in OCR text.')
      }
    }
  } else {
    // No OCR text — try native QR decode from the doc file directly
    const nativeResult = await decodeQRFromDocPath(supabase, talonPath)
    if (nativeResult.text) {
      // Native decode succeeded — parse the QR text as a SAT URL
      qrData = extractQRFromText(nativeResult.text)
      if (!qrData) {
        // QR decoded but not a SAT URL — try UUID extraction
        const uuid = extractUUIDFromText(nativeResult.text)
        if (uuid) {
          qrData = {
            uuid,
            rfc_emisor: '',
            rfc_receptor: '',
            total: '0.00',
            sello_tail: '',
            source_url: nativeResult.text,
          }
          extractionMethod = 'ocr_fallback'
          warnings.push(`Native QR decoded text but no full SAT URL (method: ${nativeResult.method})`)
        } else {
          warnings.push(`Native QR decoded text but no UUID or SAT URL found (method: ${nativeResult.method})`)
        }
      } else {
        extractionMethod = 'qr_url'
        warnings.push(`QR decoded natively via ${nativeResult.method}`)
      }
    } else {
      // Native decode failed or doc not accessible
      if (nativeResult.warning) warnings.push(nativeResult.warning)
      warnings.push('Native QR decode found nothing. CFDI extraction skipped.')
    }
  }

  // -- Step 2: Early return if nothing to validate --
  if (!qrData) {
    const extraction = await persistExtraction(supabase, {
      solicitud_id: solicitudId ?? null,
      quality_run_id: qualityRunId ?? null,
      source_doc_path: talonPath,
      extraction_method: 'qr_url',
      qr_data: null,
      sat_result: null,
      duplicate_detected: false,
      extracted_at: new Date().toISOString(),
      warnings,
    })

    return {
      status: 'extraction_failed',
      extraction,
      summary: warnings.join(' '),
    }
  }

  // -- Step 3: Duplicate UUID check --
  let duplicateSolicitudIds: string[] = []
  let duplicateDetected = false

  try {
    const { data: existingRows } = await supabase
      .from('cfdi_extractions')
      .select('solicitud_id')
      .eq('qr_data->>uuid', qrData.uuid)
      .neq('solicitud_id', solicitudId ?? '')  // exclude current
      .not('solicitud_id', 'is', null)

    if (existingRows && existingRows.length > 0) {
      duplicateSolicitudIds = existingRows.map((r) => r.solicitud_id as string)
      duplicateDetected = true
    }
  } catch (err) {
    warnings.push(`Duplicate check failed (non-blocking): ${String(err)}`)
  }

  // -- Step 4: SAT Verification --
  const validator = getSATValidator()
  const satResult = await validator.verify({
    uuid: qrData.uuid,
    rfc_emisor: qrData.rfc_emisor,
    rfc_receptor: qrData.rfc_receptor,
    total: qrData.total,
    sello_tail: qrData.sello_tail,
  })

  // -- Step 5: Persist --
  const extraction = await persistExtraction(supabase, {
    solicitud_id: solicitudId ?? null,
    quality_run_id: qualityRunId ?? null,
    source_doc_path: talonPath,
    extraction_method: extractionMethod,
    qr_data: qrData,
    sat_result: satResult,
    duplicate_detected: duplicateDetected,
    duplicate_solicitud_ids: duplicateSolicitudIds,
    extracted_at: new Date().toISOString(),
    warnings,
  })

  // -- Step 6: Derive status --
  if (duplicateDetected) {
    return {
      status: 'duplicate',
      extraction,
      summary: `UUID ${qrData.uuid} ya existe en otra(s) solicitud(es): ${duplicateSolicitudIds.join(', ')}`,
    }
  }

  if (!satResult.reachable) {
    return {
      status: 'sat_unreachable',
      extraction,
      summary: satResult.error ?? 'No se pudo conectar al SAT para verificar el CFDI.',
    }
  }

  switch (satResult.status) {
    case 'Vigente':
      return {
        status: 'valid',
        extraction,
        summary: `CFDI ${qrData.uuid} verificado como Vigente en el SAT.`,
      }
    case 'Cancelado':
      return {
        status: 'cancelled',
        extraction,
        summary: `CFDI ${qrData.uuid} está CANCELADO en el SAT. ${satResult.cancel_reason ?? ''}`.trim(),
      }
    case 'No Encontrado':
      return {
        status: 'not_found',
        extraction,
        summary: `CFDI ${qrData.uuid} no encontrado en el registro del SAT.`,
      }
    default:
      return {
        status: 'sat_unreachable',
        extraction,
        summary: `Error inesperado del SAT: ${satResult.error ?? satResult.status}`,
      }
  }
}

// ──────────────────────────────────────────────────────────────
// Persist cfdi_extractions row (non-throwing)
// ──────────────────────────────────────────────────────────────
async function persistExtraction(
  supabase: SupabaseClient,
  row: Omit<CFDIExtraction, 'id'>
): Promise<CFDIExtraction | undefined> {
  try {
    const { data } = await supabase
      .from('cfdi_extractions')
      .insert(row)
      .select('id')
      .single()
    return data ? { ...row, id: data.id } : undefined
  } catch (err) {
    // Persistence failure must never crash the validation pipeline
    console.error('[validateCFDI] Persistence error (non-blocking):', err)
    return undefined
  }
}
