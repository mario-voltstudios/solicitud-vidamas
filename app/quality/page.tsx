// ============================================================
// Quality Override Dashboard — Mario Only
// /quality — server component, reads open hard stops
// ============================================================

import { createServerClient } from '@/lib/supabase'
import { OverrideForm } from './OverrideForm'

export const dynamic = 'force-dynamic'

// CFDI status color + icon mapping
const CFDI_STATUS_CONFIG: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  Vigente:      { bg: 'bg-green-100', text: 'text-green-800', icon: '✅', label: 'SAT: Vigente' },
  Cancelado:    { bg: 'bg-red-100',   text: 'text-red-800',   icon: '❌', label: 'SAT: Cancelado' },
  'No Encontrado': { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '⚠️', label: 'SAT: No Encontrado' },
  error:        { bg: 'bg-gray-100',  text: 'text-gray-600',  icon: '🔌', label: 'SAT: Error' },
}

// Severity color mapping
const SEVERITY_CONFIG: Record<string, { badge: string; border: string }> = {
  stop: { badge: 'bg-red-100 text-red-700', border: 'border-red-200' },
  flag: { badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-200' },
  info: { badge: 'bg-blue-100 text-blue-700', border: 'border-blue-200' },
}

// Category icon mapping
const CATEGORY_ICONS: Record<string, string> = {
  cfdi:            '🧾',
  cfdi_duplicate:  '📑',
  cancellation:    '🚫',
  expediente:      '📂',
  seller_mismatch: '🕵️',
  face_match:      '👤',
  video:           '🎥',
  eligibility:     '📋',
  existing_policy: '🔄',
  duplicate:       '⚠️',
}

// Extract CFDI evidence from a finding's evidence object
function getCFDIEvidence(evidence: Record<string, unknown> | null | undefined) {
  if (!evidence) return null
  const cfdi = evidence.cfdi_extraction as Record<string, unknown> | undefined
  if (!cfdi) return null
  return cfdi
}

export default async function QualityPage() {
  const supabase = createServerClient()

  // Fetch open hard stops + flags (no override yet, not resolved)
  const { data: stops } = await supabase
    .from('quality_findings')
    .select('id, severity, category, rule_code, title, detail, detected_at, solicitud_id, policy_number, agent_id, dependencia, status_label, evidence')
    .eq('severity', 'stop')
    .is('resolved_at', null)
    .order('detected_at', { ascending: false })
    .limit(100)

  const { data: flags } = await supabase
    .from('quality_findings')
    .select('id, severity, category, rule_code, title, detail, detected_at, solicitud_id, policy_number, agent_id, dependencia, status_label, evidence')
    .eq('severity', 'flag')
    .is('resolved_at', null)
    .order('detected_at', { ascending: false })
    .limit(50)

  // Fetch recent CFDI extractions for context
  const { data: cfdiExtractions } = await supabase
    .from('cfdi_extractions')
    .select('id, solicitud_id, qr_data, sat_result, duplicate_detected, warnings, extracted_at, extraction_method')
    .order('extracted_at', { ascending: false })
    .limit(20)

  const openStops = stops ?? []
  const openFlags = flags ?? []
  const recentCFDI = cfdiExtractions ?? []

  // Build CFDI lookup by solicitud_id
  const cfdiBySOL = new Map(recentCFDI.map((c) => [c.solicitud_id, c]))

  const FindingCard = ({ f, showOverride }: { f: typeof openStops[0]; showOverride: boolean }) => {
    const sevCfg = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG.info
    const catIcon = CATEGORY_ICONS[f.category ?? ''] ?? '🔍'
    const cfdiEv = getCFDIEvidence(f.evidence as Record<string, unknown>)
    const cfdiRow = f.solicitud_id ? cfdiBySOL.get(f.solicitud_id) : null
    const satStatus = (cfdiRow?.sat_result as Record<string, unknown> | undefined)?.status as string | undefined
    const satCfg = satStatus ? CFDI_STATUS_CONFIG[satStatus] : undefined

    return (
      <div className={`bg-white border ${sevCfg.border} rounded-lg shadow-sm p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`inline-block ${sevCfg.badge} text-xs font-semibold px-2 py-0.5 rounded uppercase`}>
                {catIcon} {f.severity}
              </span>
              <span className="text-xs text-gray-400 font-mono">{f.rule_code}</span>
              {satCfg && (
                <span className={`inline-block ${satCfg.bg} ${satCfg.text} text-xs font-semibold px-2 py-0.5 rounded`}>
                  {satCfg.icon} {satCfg.label}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-gray-800">{f.title}</h2>
            {f.detail && <p className="text-sm text-gray-600 mt-1">{f.detail}</p>}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
              {f.policy_number && <span>Póliza: <strong className="text-gray-600">{f.policy_number}</strong></span>}
              {f.solicitud_id && <span>Solicitud: <strong className="text-gray-600">{f.solicitud_id.slice(0, 8)}…</strong></span>}
              {f.agent_id && <span>Agente: <strong className="text-gray-600">{f.agent_id}</strong></span>}
              {f.dependencia && <span>Dep: <strong className="text-gray-600">{f.dependencia}</strong></span>}
              <span>Detectado: {new Date(f.detected_at).toLocaleString('es-MX')}</span>
            </div>

            {/* CFDI evidence panel */}
            {(cfdiEv || cfdiRow) && (
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded p-3 text-xs">
                <div className="font-semibold text-gray-700 mb-1">🧾 Evidencia CFDI</div>
                {cfdiRow?.qr_data && (
                  <div className="space-y-0.5 text-gray-600">
                    <div>UUID: <span className="font-mono text-gray-800">{(cfdiRow.qr_data as Record<string, unknown>).uuid as string}</span></div>
                    <div>RFC Emisor: <span className="font-mono">{(cfdiRow.qr_data as Record<string, unknown>).rfc_emisor as string}</span></div>
                    <div>RFC Receptor: <span className="font-mono">{(cfdiRow.qr_data as Record<string, unknown>).rfc_receptor as string}</span></div>
                    <div>Total: <span className="font-mono">${(cfdiRow.qr_data as Record<string, unknown>).total as string}</span></div>
                  </div>
                )}
                {cfdiRow?.sat_result && (() => {
                  const sr = cfdiRow.sat_result as Record<string, unknown>
                  const sc = satStatus ? CFDI_STATUS_CONFIG[satStatus] : undefined
                  return (
                    <div className={`mt-2 px-2 py-1 rounded ${sc?.bg ?? 'bg-gray-100'} ${sc?.text ?? 'text-gray-700'} font-semibold`}>
                      {sc?.icon} Estado SAT: {sr.status as string}
                      {Boolean(sr.cancel_reason) && <span className="ml-2 font-normal">({sr.cancel_reason as string})</span>}
                    </div>
                  )
                })()}
                {cfdiRow?.duplicate_detected && (
                  <div className="mt-2 text-red-700 font-semibold">🔴 UUID DUPLICADO detectado</div>
                )}
                {cfdiRow?.extraction_method && (
                  <div className="mt-1 text-gray-400">Extracción: {cfdiRow.extraction_method as string} · {new Date(cfdiRow.extracted_at as string).toLocaleString('es-MX')}</div>
                )}
              </div>
            )}

            {/* Generic evidence (non-CFDI) */}
            {f.evidence && !cfdiEv && !cfdiRow && (
              <details className="mt-2">
                <summary className="text-xs text-gray-400 cursor-pointer">Ver evidencia</summary>
                <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-auto max-h-24">
                  {JSON.stringify(f.evidence, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>

        {showOverride && <OverrideForm findingId={f.id} findingTitle={f.title} />}
      </div>
    )
  }

  return (
    <main className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🔒 Filtro Calidad — Override Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          Solo Mario puede aprobar o rechazar estos hallazgos. Cada decisión queda registrada.
        </p>
        <div className="flex gap-3 mt-3 text-sm">
          <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded font-semibold">🛑 {openStops.length} paradas duras</span>
          <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded font-semibold">⚠️ {openFlags.length} banderas</span>
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">🧾 {recentCFDI.length} CFDI verificados</span>
        </div>
      </div>

      {/* CFDI Summary Panel */}
      {recentCFDI.length > 0 && (
        <div className="mb-6 bg-white border border-blue-100 rounded-lg p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">🧾 Últimas Verificaciones CFDI (SAT)</h2>
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            {(['Vigente', 'No Encontrado', 'Cancelado'] as const).map((st) => {
              const count = recentCFDI.filter((c) => (c.sat_result as Record<string, unknown> | null)?.status === st).length
              const cfg = CFDI_STATUS_CONFIG[st]
              return (
                <div key={st} className={`${cfg.bg} ${cfg.text} rounded p-2`}>
                  <div className="text-xl font-bold">{count}</div>
                  <div className="text-xs">{cfg.icon} {st}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {openStops.length === 0 && openFlags.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center text-green-800">
          ✅ No hay paradas duras ni banderas pendientes. Cola limpia.
        </div>
      ) : (
        <>
          {/* Hard stops — require Mario override */}
          {openStops.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-red-700 uppercase mb-2">🛑 Paradas Duras — Requieren Override</h2>
              <div className="space-y-4">
                {openStops.map((f) => (
                  <FindingCard key={f.id} f={f} showOverride={true} />
                ))}
              </div>
            </div>
          )}

          {/* Flags — informational, no override needed */}
          {openFlags.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-yellow-700 uppercase mb-2">⚠️ Banderas — Revisión Manual</h2>
              <div className="space-y-4">
                {openFlags.map((f) => (
                  <FindingCard key={f.id} f={f} showOverride={false} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
