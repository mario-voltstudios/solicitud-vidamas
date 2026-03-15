import type { FormData } from '@/lib/types'
import { getMissingRequiredDocs, getUploadedDocs } from '@/lib/dependencia-rules'

export type IntakeStatus = 'pending_docs' | 'pending_verification' | 'ready_for_emision'

export function deriveIntakeStatus(formData: FormData): {
  status: IntakeStatus
  missingDocs: string[]
  missingVerification: string[]
} {
  const missingDocs = getMissingRequiredDocs(formData).map((doc) => doc.title)
  const uploaded = getUploadedDocs(formData)
  const missingVerification: string[] = []

  if (!uploaded.video) {
    missingVerification.push('Video de verificación')
  }

  if (missingDocs.length > 0) {
    return { status: 'pending_docs', missingDocs, missingVerification }
  }

  if (missingVerification.length > 0) {
    return { status: 'pending_verification', missingDocs, missingVerification }
  }

  return { status: 'ready_for_emision', missingDocs, missingVerification }
}
