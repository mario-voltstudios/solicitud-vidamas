// ============================================================
// Filtro de Calidad v1 — Face Match Provider Abstraction
// lib/filtro-calidad/face-match.ts
// Created: 2026-03-17
// ============================================================
//
// PURPOSE:
//   Compare the face in a submitted video frame (or photo) against
//   the INE photo to detect applicant substitution / identity fraud.
//
// DESIGN:
//   - Provider-agnostic interface: swap Rekognition, Azure, or any
//     other provider without touching caller code.
//   - Result contract: FaceMatchResult (score, verdict, evidence).
//   - Config via env vars — see FACE_MATCH_CONFIG below.
//   - Graceful manual-review fallback when:
//       * No provider configured (FACE_MATCH_PROVIDER=none / unset)
//       * Provider call fails (network, quota, credentials)
//       * Score is inconclusive (below FACE_MATCH_THRESHOLD)
//
// RULE CODES generated:
//   FACE_MATCH_MISMATCH      — score < threshold (hard stop)
//   FACE_MATCH_INCONCLUSIVE  — provider unavailable / fallback (flag → manual review)
//
// ENV VARS (document in .env.local.example):
//   FACE_MATCH_PROVIDER        = "rekognition" | "azure" | "none"  (default: "none")
//   FACE_MATCH_THRESHOLD       = 0.92  (float 0–1, default 0.92)
//   AWS_REGION                 = (for rekognition)
//   AWS_ACCESS_KEY_ID          = (for rekognition)
//   AWS_SECRET_ACCESS_KEY      = (for rekognition)
//   AZURE_FACE_ENDPOINT        = (for azure)
//   AZURE_FACE_KEY             = (for azure)
// ============================================================

import type { QualityFinding } from './types'
import { RULE_CODES } from './types'

// ----------------------------------------------------------
// Result contract
// ----------------------------------------------------------

export type FaceMatchVerdict =
  | 'match'        // confident same person
  | 'mismatch'     // confident different person → hard stop
  | 'inconclusive' // provider unavailable or score in grey zone
  | 'skipped'      // no provider configured

export interface FaceMatchResult {
  verdict: FaceMatchVerdict
  score?: number          // 0–1 similarity score when available
  provider: string        // "rekognition" | "azure" | "none"
  evidence?: Record<string, unknown>
  error?: string          // human-readable error if call failed
}

// ----------------------------------------------------------
// Provider interface
// ----------------------------------------------------------

export interface FaceMatchProvider {
  name: string
  compare(imageA: Buffer | string, imageB: Buffer | string): Promise<{ score: number }>
}

// ----------------------------------------------------------
// Config
// ----------------------------------------------------------

const FACE_MATCH_PROVIDER = (process.env.FACE_MATCH_PROVIDER ?? 'none').toLowerCase()
const FACE_MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD ?? '0.92')

// ----------------------------------------------------------
// Provider implementations
// ----------------------------------------------------------

/**
 * Null provider — always returns inconclusive.
 * Used when FACE_MATCH_PROVIDER=none (default until credentials are set).
 */
const noneProvider: FaceMatchProvider = {
  name: 'none',
  async compare(_a, _b) {
    throw new Error('No face match provider configured')
  }
}

/**
 * AWS Rekognition provider.
 * Requires: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *
 * Lazy-loaded so the aws-sdk import is optional (not in package.json yet).
 */
async function getRekognitionProvider(): Promise<FaceMatchProvider> {
  try {
    // Dynamic import — install @aws-sdk/client-rekognition to enable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { RekognitionClient, CompareFacesCommand } = await import(
      '@aws-sdk/client-rekognition' as string
    ) as any
    const client = new RekognitionClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
    return {
      name: 'rekognition',
      async compare(imageA, imageB) {
        const toBytes = (img: Buffer | string): Uint8Array =>
          Buffer.isBuffer(img) ? img : Buffer.from(img, 'base64')
        const cmd = new CompareFacesCommand({
          SourceImage: { Bytes: toBytes(imageA) },
          TargetImage: { Bytes: toBytes(imageB) },
          SimilarityThreshold: 0,
        })
        const resp = await client.send(cmd)
        const topMatch = resp.FaceMatches?.[0]
        return { score: (topMatch?.Similarity ?? 0) / 100 }
      }
    }
  } catch {
    throw new Error('AWS Rekognition SDK not available — install @aws-sdk/client-rekognition')
  }
}

/**
 * Azure Face API provider.
 * Requires: AZURE_FACE_ENDPOINT, AZURE_FACE_KEY
 *
 * Uses native fetch — no SDK needed.
 */
function getAzureProvider(): FaceMatchProvider {
  const endpoint = process.env.AZURE_FACE_ENDPOINT ?? ''
  const key = process.env.AZURE_FACE_KEY ?? ''
  if (!endpoint || !key) throw new Error('AZURE_FACE_ENDPOINT / AZURE_FACE_KEY not set')

  return {
    name: 'azure',
    async compare(imageA, imageB) {
      const toBase64 = (img: Buffer | string) =>
        Buffer.isBuffer(img) ? img.toString('base64') : img

      // Detect face A
      const detectUrl = `${endpoint}/face/v1.0/detect?returnFaceId=true`
      const headers = { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' }

      const [resA, resB] = await Promise.all([
        fetch(detectUrl, { method: 'POST', headers, body: JSON.stringify({ url: `data:image/jpeg;base64,${toBase64(imageA)}` }) }),
        fetch(detectUrl, { method: 'POST', headers, body: JSON.stringify({ url: `data:image/jpeg;base64,${toBase64(imageB)}` }) }),
      ])
      const [facesA, facesB] = await Promise.all([resA.json(), resB.json()])
      const faceIdA = facesA[0]?.faceId
      const faceIdB = facesB[0]?.faceId
      if (!faceIdA || !faceIdB) throw new Error('Azure: face not detected in one or both images')

      const verifyRes = await fetch(`${endpoint}/face/v1.0/verify`, {
        method: 'POST', headers,
        body: JSON.stringify({ faceId1: faceIdA, faceId2: faceIdB })
      })
      const verify = await verifyRes.json()
      return { score: verify.confidence ?? 0 }
    }
  }
}

// ----------------------------------------------------------
// Main: compareFaces
// ----------------------------------------------------------

/**
 * Compare two face images and return a FaceMatchResult.
 *
 * @param ineImageB64  - Base64-encoded INE photo (front)
 * @param videoFrameB64 - Base64-encoded video frame showing applicant's face
 * @returns FaceMatchResult
 */
export async function compareFaces(
  ineImageB64: string,
  videoFrameB64: string
): Promise<FaceMatchResult> {
  let provider: FaceMatchProvider = noneProvider

  try {
    if (FACE_MATCH_PROVIDER === 'rekognition') {
      provider = await getRekognitionProvider()
    } else if (FACE_MATCH_PROVIDER === 'azure') {
      provider = getAzureProvider()
    } else {
      // No provider configured — return skipped (graceful fallback)
      return {
        verdict: 'skipped',
        provider: 'none',
        evidence: { reason: 'FACE_MATCH_PROVIDER not configured — manual review required' }
      }
    }

    const { score } = await provider.compare(ineImageB64, videoFrameB64)

    if (score >= FACE_MATCH_THRESHOLD) {
      return { verdict: 'match', score, provider: provider.name, evidence: { threshold: FACE_MATCH_THRESHOLD } }
    } else {
      return { verdict: 'mismatch', score, provider: provider.name, evidence: { threshold: FACE_MATCH_THRESHOLD } }
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    return {
      verdict: 'inconclusive',
      provider: provider.name,
      error,
      evidence: { reason: 'Provider call failed — routing to manual review' }
    }
  }
}

// ----------------------------------------------------------
// Convert FaceMatchResult → QualityFinding
// ----------------------------------------------------------

/**
 * Convert a FaceMatchResult into a QualityFinding when action is required.
 * Returns null for 'match' (clean).
 */
export function faceMatchToFinding(
  result: FaceMatchResult,
  solicitudId?: string,
  policyNumber?: string
): QualityFinding | null {
  if (result.verdict === 'match') return null

  if (result.verdict === 'mismatch') {
    return {
      solicitud_id: solicitudId ?? null,
      policy_number: policyNumber ?? null,
      severity: 'stop',
      category: 'face_match',
      rule_code: RULE_CODES.FACE_MATCH_MISMATCH,
      status_label: 'blocked_doc_authenticity_risk',
      title: 'Face match: persona en video no coincide con INE',
      detail: `Score: ${result.score?.toFixed(3) ?? 'N/A'} — umbral: ${FACE_MATCH_THRESHOLD}. Posible sustitución de asegurado.`,
      evidence: { ...result.evidence, score: result.score, provider: result.provider },
      detected_at: new Date().toISOString(),
    }
  }

  // inconclusive or skipped → flag for manual review
  return {
    solicitud_id: solicitudId ?? null,
    policy_number: policyNumber ?? null,
    severity: 'flag',
    category: 'face_match',
    rule_code: RULE_CODES.FACE_MATCH_INCONCLUSIVE,
    status_label: 'pending_manual_review',
    title: result.verdict === 'skipped'
      ? 'Face match: proveedor no configurado — revisión manual requerida'
      : 'Face match: inconcluso — revisión manual requerida',
    detail: result.error ?? 'Proveedor de face match no disponible o credenciales no configuradas.',
    evidence: { ...result.evidence, provider: result.provider, error: result.error },
    detected_at: new Date().toISOString(),
  }
}
