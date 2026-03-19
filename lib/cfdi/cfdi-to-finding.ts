// ============================================================
// CFDI Validation → Quality Finding Mapper
// lib/cfdi/cfdi-to-finding.ts
// Created: 2026-03-19
//
// Converts a CFDIValidationResult into 0 or 1 QualityFinding
// for insertion into quality_findings by intake-hook / retro-runner.
// ============================================================

import type { QualityFinding } from '@/lib/filtro-calidad/types'
import { RULE_CODES } from '@/lib/filtro-calidad/types'
import type { CFDIValidationResult } from './types'

/**
 * Map a CFDIValidationResult to a QualityFinding.
 * Returns null if the result is clean (valid or skipped).
 */
export function cfdiValidationToFinding(
  result: CFDIValidationResult,
  solicitudId?: string | null,
  agentId?: string | null,
  dependencia?: string | null
): QualityFinding | null {
  const base: Omit<QualityFinding, 'severity' | 'category' | 'rule_code' | 'status_label' | 'title' | 'detail'> = {
    solicitud_id: solicitudId ?? null,
    agent_id: agentId ?? null,
    dependencia: dependencia ?? null,
    detected_at: new Date().toISOString(),
    evidence: {
      cfdi_status: result.status,
      extraction_id: result.extraction?.id ?? null,
      uuid: result.extraction?.qr_data?.uuid ?? null,
    },
  }

  switch (result.status) {
    case 'valid':
    case 'skipped':
      return null

    case 'duplicate':
      return {
        ...base,
        severity: 'stop',
        category: 'duplicate',
        rule_code: RULE_CODES.DUPLICATE_CFDI_UUID,
        status_label: 'blocked_duplicate_risk',
        title: 'UUID de CFDI duplicado — nómina ya registrada en otra solicitud',
        detail: result.summary,
      }

    case 'cancelled':
      return {
        ...base,
        severity: 'stop',
        category: 'doc_authenticity',
        rule_code: 'CFDI_CANCELLED',
        status_label: 'blocked_doc_authenticity_risk',
        title: 'CFDI cancelado en el SAT',
        detail: result.summary,
      }

    case 'not_found':
      return {
        ...base,
        severity: 'flag',
        category: 'doc_authenticity',
        rule_code: 'CFDI_NOT_FOUND',
        status_label: 'pending_manual_review',
        title: 'CFDI no encontrado en el SAT — revisión manual',
        detail: result.summary,
      }

    case 'sat_unreachable':
      return {
        ...base,
        severity: 'flag',
        category: 'doc_authenticity',
        rule_code: 'CFDI_SAT_UNREACHABLE',
        status_label: 'pending_manual_review',
        title: 'No se pudo verificar CFDI con SAT — revisión pendiente',
        detail: result.summary,
      }

    case 'extraction_failed':
      return {
        ...base,
        severity: 'flag',
        category: 'doc_authenticity',
        rule_code: 'CFDI_EXTRACTION_FAILED',
        status_label: 'pending_manual_review',
        title: 'No se pudo extraer UUID del talón de pago — revisión manual',
        detail: result.summary,
      }

    default:
      return null
  }
}
