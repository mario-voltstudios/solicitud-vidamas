'use server'
// ============================================================
// Quality Override Dashboard — Mario Only
// /quality — server component, reads open hard stops
// ============================================================

import { createServerClient } from '@/lib/supabase'
import { OverrideForm } from './OverrideForm'

export const dynamic = 'force-dynamic'

export default async function QualityPage() {
  const supabase = createServerClient()

  // Fetch open hard stops (no override yet, not resolved)
  const { data: findings } = await supabase
    .from('quality_findings')
    .select(`
      id,
      severity,
      category,
      rule_code,
      title,
      detail,
      detected_at,
      solicitud_id,
      policy_number,
      agent_id,
      dependencia,
      status_label,
      evidence
    `)
    .eq('severity', 'stop')
    .is('resolved_at', null)
    .order('detected_at', { ascending: false })
    .limit(100)

  const openStops = findings ?? []

  return (
    <main className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🔒 Filtro Calidad — Override Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          Solo Mario puede aprobar o rechazar estos hallazgos. Cada decisión queda registrada.
        </p>
      </div>

      {openStops.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center text-green-800">
          ✅ No hay paradas duras pendientes. Cola limpia.
        </div>
      ) : (
        <div className="space-y-4">
          {openStops.map((f) => (
            <div key={f.id} className="bg-white border border-red-200 rounded-lg shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded uppercase">
                      {f.severity}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{f.rule_code}</span>
                  </div>
                  <h2 className="text-base font-semibold text-gray-800">{f.title}</h2>
                  {f.detail && <p className="text-sm text-gray-600 mt-1">{f.detail}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
                    {f.policy_number && <span>Póliza: <strong>{f.policy_number}</strong></span>}
                    {f.solicitud_id && <span>Solicitud: <strong>{f.solicitud_id}</strong></span>}
                    {f.agent_id && <span>Agente: <strong>{f.agent_id}</strong></span>}
                    {f.dependencia && <span>Dep: <strong>{f.dependencia}</strong></span>}
                    <span>Detectado: {new Date(f.detected_at).toLocaleString('es-MX')}</span>
                  </div>
                  {f.evidence && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-400 cursor-pointer">Ver evidencia</summary>
                      <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-auto max-h-24">
                        {JSON.stringify(f.evidence, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>

              <OverrideForm findingId={f.id} findingTitle={f.title} />
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
