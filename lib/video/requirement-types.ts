// ============================================================
// Video Verification Requirements — Emision Compliance
// ============================================================
// Each solicitud must record 7 short videos confirming key
// acceptance statements per GNP dependencia rules.
// ============================================================

/** Status for a single video requirement */
export type VideoRequirementStatus = 'pending' | 'recording' | 'uploading' | 'complete' | 'review'

/** A single video requirement definition */
export interface VideoRequirement {
  key: string
  title: string
  description: string
  prompt: string   // What the asegurado should say on camera
  order: number
}

/** Runtime state tracked per requirement in the wizard */
export interface VideoRequirementState {
  status: VideoRequirementStatus
  storagePath?: string     // Supabase Storage path
  signedUrl?: string       // Signed URL for playback
  uploadProgress?: number  // 0-100
  error?: string
  reviewedAt?: string      // ISO timestamp when marked complete/review
}

/** The 7 emision video requirements — canonical order */
export const VIDEO_REQUIREMENTS: VideoRequirement[] = [
  {
    key: 'datos_personales',
    title: 'Confirma datos personales',
    description: 'El asegurado confirma que sus datos personales son correctos.',
    prompt: 'Mi nombre es [nombre completo], mi fecha de nacimiento es [fecha], y mis datos personales registrados en esta solicitud son correctos.',
    order: 1,
  },
  {
    key: 'beneficiarios',
    title: 'Confirma beneficiarios',
    description: 'El asegurado confirma los beneficiarios designados.',
    prompt: 'Confirmo que los beneficiarios designados en mi solicitud son: [nombres y porcentajes].',
    order: 2,
  },
  {
    key: 'forma_cobro',
    title: 'Confirma forma de cobro',
    description: 'El asegurado confirma la forma de cobro autorizada.',
    prompt: 'Autorizo el cobro de mi prima mediante [nómina/CLABE] con los datos registrados en mi solicitud.',
    order: 3,
  },
  {
    key: 'otros_seguros',
    title: 'Declara no tener otros seguros',
    description: 'El asegurado declara no contar con otros seguros de vida vigentes.',
    prompt: 'Declaro que no cuento con otros seguros de vida vigentes con esta o cualquier otra aseguradora.',
    order: 4,
  },
  {
    key: 'salud_actividad',
    title: 'Declara salud y actividad',
    description: 'El asegurado declara que goza de buena salud y describe su actividad.',
    prompt: 'Declaro que gozo de buena salud, no padezco enfermedades crónicas, y mi actividad principal es [ocupación].',
    order: 5,
  },
  {
    key: 'firma_solicitud_p1',
    title: 'Firma solicitud (P1)',
    description: 'El asegurado muestra y confirma la firma en la página 1 de la solicitud.',
    prompt: 'Confirmo que la firma que aparece en la página 1 de la solicitud es mi firma autógrafa.',
    order: 6,
  },
  {
    key: 'firma_condiciones_p2',
    title: 'Firma condiciones (P2)',
    description: 'El asegurado muestra y confirma la firma en las condiciones generales.',
    prompt: 'Confirmo que he leído las condiciones generales y que la firma en la página 2 es mi firma autógrafa.',
    order: 7,
  },
]

/** Create default (all-pending) state map */
export function createDefaultVideoStates(): Record<string, VideoRequirementState> {
  const states: Record<string, VideoRequirementState> = {}
  for (const req of VIDEO_REQUIREMENTS) {
    states[req.key] = { status: 'pending' }
  }
  return states
}

/** Count requirements by status */
export function countByStatus(
  states: Record<string, VideoRequirementState>
): Record<VideoRequirementStatus, number> {
  const counts: Record<VideoRequirementStatus, number> = {
    pending: 0,
    recording: 0,
    uploading: 0,
    complete: 0,
    review: 0,
  }
  for (const req of VIDEO_REQUIREMENTS) {
    const s = states[req.key]?.status ?? 'pending'
    counts[s]++
  }
  return counts
}

/** Are all 7 requirements complete? */
export function allVideosComplete(states: Record<string, VideoRequirementState>): boolean {
  return VIDEO_REQUIREMENTS.every((r) => states[r.key]?.status === 'complete')
}

/** Get overall completion percentage (0-100) */
export function getVideoCompletionPct(states: Record<string, VideoRequirementState>): number {
  const done = VIDEO_REQUIREMENTS.filter((r) => states[r.key]?.status === 'complete').length
  return Math.round((done / VIDEO_REQUIREMENTS.length) * 100)
}

/** Storage path helper */
export function videoStoragePath(folio: string, requirementKey: string): string {
  return `${folio}/video/${requirementKey}-${Date.now()}.webm`
}
