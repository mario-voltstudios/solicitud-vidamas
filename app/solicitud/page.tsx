'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import WizardProgress from '@/components/WizardProgress'
import StepAgent from '@/components/wizard/StepAgent'
import StepContratante from '@/components/wizard/StepContratante'
import StepCobro from '@/components/wizard/StepCobro'
import StepAsegurado from '@/components/wizard/StepAsegurado'
import StepPlan from '@/components/wizard/StepPlan'
import StepBeneficiarios from '@/components/wizard/StepBeneficiarios'
import StepDocumentos from '@/components/wizard/StepDocumentos'
import StepReview from '@/components/wizard/StepReview'
import { FormData, INITIAL_FORM_DATA } from '@/lib/types'
import { getCurrentSemana, generateFolio } from './actions'

const STORAGE_KEY = 'solicitud_vidamas_form'

function SolicitudPageInner() {
  const searchParams = useSearchParams()
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [agentePrefilled, setAgentePrefilled] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [formData, setFormDataState] = useState<FormData>(() => {
    // Load from localStorage on init (offline tolerance)
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          return { ...INITIAL_FORM_DATA, ...parsed }
        }
      } catch {}
    }
    return INITIAL_FORM_DATA
  })

  // Magic token auth — validate token and pre-fill agent info
  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) return

    // Already processed this token
    if (agentePrefilled) return

    const STORAGE_AGENT_KEY = 'solicitud_vidamas_agent_prefilled'
    const storedAgent = localStorage.getItem(STORAGE_AGENT_KEY)
    if (storedAgent) {
      try {
        const agentData = JSON.parse(storedAgent)
        if (agentData.clave_agente && agentData.nombre_agente) {
          setFormData({
            clave_agente: agentData.clave_agente,
            nombre_agente: agentData.nombre_agente,
            correo_agente: agentData.correo_agente || '',
            contratante_dependencia: agentData.contratante_dependencia || '',
          })
          setAgentePrefilled(true)
          setCurrentStep(2)
          return
        }
      } catch {}
    }

    const tokenStr = token
    let cancelled = false
    async function validateToken() {
      setTokenLoading(true)
      setTokenError('')
      try {
        const res = await fetch(`/api/auth/token?token=${encodeURIComponent(tokenStr)}`)
        const data = await res.json()

        if (cancelled) return

        if (!res.ok || !data.success || !data.agente) {
          setTokenError(data.error || 'Este enlace no es válido o ha expirado')
          return
        }

        const agente = data.agente

        // Generate folio
        let folio = ''
        try {
          const semana = await getCurrentSemana()
          if (semana) {
            folio = await generateFolio(agente.clave, {
              year: semana.year,
              week_number: semana.week_number,
            })
          }
        } catch (folioErr) {
          console.error('Folio generation failed:', folioErr)
        }

        setFormData({
          clave_agente: agente.clave,
          nombre_agente: agente.nombre_completo,
          folio: folio || '',
        })

        // Store in localStorage so refresh doesn't re-fetch
        localStorage.setItem(STORAGE_AGENT_KEY, JSON.stringify({
          clave_agente: agente.clave,
          nombre_agente: agente.nombre_completo,
          correo_agente: agente.correo,
          rfc_ejecutivo: agente.rfc,
          tiene_cedula: agente.tiene_cedula,
        }))

        setAgentePrefilled(true)
        setCurrentStep(2)
      } catch (err) {
        if (!cancelled) {
          setTokenError('Error de conexión. Verifica tu señal e intenta de nuevo.')
        }
      } finally {
        if (!cancelled) setTokenLoading(false)
      }
    }

    validateToken()
    return () => { cancelled = true }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData))
    } catch {}
  }, [formData])

  const setFormData = useCallback((updates: Partial<FormData>) => {
    setFormDataState(prev => ({ ...prev, ...updates }))
  }, [])

  function goNext() {
    setCompletedSteps(prev => new Set([...prev, currentStep]))
    setCurrentStep(prev => Math.min(prev + 1, 8))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goBack() {
    setCurrentStep(prev => Math.max(prev - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goToStep(step: number) {
    setCurrentStep(step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const stepProps = {
    formData,
    setFormData,
    onNext: goNext,
    onBack: goBack,
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#003087] text-white px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
          <span className="text-[#003087] font-bold text-sm">G</span>
        </div>
        <div>
          <p className="font-bold text-sm">GNP Seguros</p>
          <p className="text-xs opacity-75">Vida Más Constante</p>
        </div>
        {formData.folio && (
          <div className="ml-auto text-right">
            <p className="text-xs opacity-75">Folio</p>
            <p className="text-xs font-mono font-bold">{formData.folio}</p>
          </div>
        )}
      </div>

      {/* Agent prefilled banner */}
      {agentePrefilled && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex items-center gap-2">
          <span className="text-green-600 text-lg">✓</span>
          <p className="text-sm text-green-800">
            <span className="font-semibold">Hola, {formData.nombre_agente}</span>
            {' '} — tus datos ya están listos
          </p>
        </div>
      )}

      {/* Token loading state */}
      {tokenLoading && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center justify-center gap-2">
          <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-sm text-blue-800">Verificando tu enlace...</span>
        </div>
      )}

      {/* Token error */}
      {tokenError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <p className="text-sm text-red-700 font-medium">⚠️ {tokenError}</p>
          <p className="text-xs text-red-600 mt-1">
            Ingresa tu clave de agente manualmente o contacta a tu gerente.
          </p>
        </div>
      )}

      {/* Progress */}
      <WizardProgress
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={goToStep}
      />

      {/* Step content */}
      <div className="px-4 py-6 max-w-lg mx-auto">
        {currentStep === 1 && <StepAgent {...stepProps} />}
        {currentStep === 2 && <StepContratante {...stepProps} />}
        {currentStep === 3 && <StepCobro {...stepProps} />}
        {currentStep === 4 && <StepAsegurado {...stepProps} />}
        {currentStep === 5 && <StepPlan {...stepProps} />}
        {currentStep === 6 && <StepBeneficiarios {...stepProps} />}
        {currentStep === 7 && <StepDocumentos {...stepProps} />}
        {currentStep === 8 && (
          <StepReview
            formData={formData}
            onBack={goBack}
            onGoToStep={goToStep}
          />
        )}
      </div>

      {/* Bottom safe area for mobile */}
      <div className="h-8" />
    </div>
  )
}

export default function SolicitudPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-[#003087] mx-auto mb-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-sm text-gray-500">Cargando solicitud...</p>
        </div>
      </div>
    }>
      <SolicitudPageInner />
    </Suspense>
  )
}
