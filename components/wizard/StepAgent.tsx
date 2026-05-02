'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { getCurrentSemana, generateFolio, getAgentes } from '@/app/solicitud/actions'
import { FormData } from '@/lib/types'

interface Agente {
  clave: string
  nombre_completo: string
  nombre_corto: string | null
  status: string | null
}

interface StepAgentProps {
  formData: FormData
  setFormData: (data: Partial<FormData>) => void
  onNext: () => void
}

export default function StepAgent({ formData, setFormData, onNext }: StepAgentProps) {
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedClave, setSelectedClave] = useState(formData.clave_agente || '')
  const [search, setSearch] = useState('')
  const [validated, setValidated] = useState(!!formData.nombre_agente)

  useEffect(() => {
    async function loadAgentes() {
      try {
        const result = await getAgentes()
        if (result.success && result.agentes) {
          setAgentes(result.agentes)
        } else {
          setError(result.error || 'Error al cargar agentes')
        }
      } catch {
        setError('Error de conexión al cargar agentes')
      } finally {
        setLoading(false)
      }
    }
    loadAgentes()
  }, [])

  const filteredAgentes = agentes.filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      a.clave.toLowerCase().includes(q) ||
      (a.nombre_completo || '').toLowerCase().includes(q) ||
      (a.nombre_corto || '').toLowerCase().includes(q)
    )
  })

  async function handleSelect(clave: string) {
    setSelectedClave(clave)
    setError('')

    const agente = agentes.find(a => a.clave === clave)
    if (!agente) {
      setError('Agente no encontrado')
      return
    }

    setLoading(true)
    try {
      const semana = await getCurrentSemana()
      if (!semana) {
        setError('Error al obtener la semana actual.')
        setLoading(false)
        return
      }

      const folio = await generateFolio(clave, semana)

      setFormData({
        clave_agente: clave,
        nombre_agente: agente.nombre_completo,
        folio,
        semana_id: semana.id,
        week_number: semana.week_number,
        year: semana.year,
      })

      setValidated(true)
    } catch {
      setError('Error al generar folio.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* GNP Branding */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-[#003087] rounded-full mb-3">
          <span className="text-white text-2xl font-bold">G</span>
        </div>
        <h1 className="text-xl font-bold text-[#003087]">GNP Seguros</h1>
        <p className="text-sm text-gray-500">Solicitud Vida Más Constante</p>
      </div>

      {!validated ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label htmlFor="agente-select" className="text-base font-medium">
                Selecciona tu nombre
              </Label>
              <p className="text-sm text-gray-500 mb-2">
                Elige tu nombre de la lista para comenzar
              </p>

              {loading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <svg className="animate-spin h-5 w-5 text-[#003087]" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-sm text-gray-500">Cargando agentes...</span>
                </div>
              ) : (
                <>
                  {/* Search */}
                  <input
                    type="text"
                    placeholder="Buscar por nombre o clave..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#003087] focus:border-transparent"
                  />

                  {/* Dropdown list */}
                  <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {filteredAgentes.length === 0 ? (
                      <p className="text-sm text-gray-400 p-4 text-center">
                        No se encontraron agentes
                      </p>
                    ) : (
                      filteredAgentes.map(agente => (
                        <button
                          key={agente.clave}
                          onClick={() => handleSelect(agente.clave)}
                          className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${
                            selectedClave === agente.clave ? 'bg-blue-50 border-l-4 border-[#003087]' : ''
                          }`}
                        >
                          <p className="font-medium text-gray-800 text-sm">
                            {agente.nombre_completo}
                          </p>
                          <p className="text-xs text-gray-400">
                            Clave: {agente.clave}
                            {agente.status && agente.status !== 'activo' && agente.status !== 'VIGENTE' && (
                              <span className="ml-2 text-orange-500">({agente.status})</span>
                            )}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">⚠️ {error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg">✓</span>
              </div>
              <div>
                <p className="text-sm text-green-600 font-medium">Agente seleccionado</p>
                <p className="text-lg font-bold text-gray-800">{formData.nombre_agente}</p>
                <p className="text-sm text-gray-500">Clave: {formData.clave_agente}</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-green-200">
              <p className="text-xs text-gray-500 mb-1">Folio de solicitud</p>
              <p className="text-lg font-mono font-bold text-[#003087]">{formData.folio}</p>
              <p className="text-xs text-gray-400">
                Semana {formData.week_number} / {formData.year}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setValidated(false)
                  setSelectedClave('')
                  setFormData({ clave_agente: '', nombre_agente: '', folio: '' })
                }}
                className="flex-1"
              >
                Cambiar agente
              </Button>
              <Button
                onClick={onNext}
                className="flex-1 bg-[#003087] hover:bg-[#002070]"
              >
                Continuar →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!validated && !loading && (
        <p className="text-center text-xs text-gray-400">
          ¿No apareces en la lista? Contacta a tu gerente
        </p>
      )}
    </div>
  )
}
