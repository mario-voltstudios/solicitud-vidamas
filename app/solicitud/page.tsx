'use client'

import { useState, useCallback, useEffect } from 'react'
import WizardProgress from '@/components/WizardProgress'
import StepAgent from '@/components/wizard/StepAgent'
import StepContratante from '@/components/wizard/StepContratante'
import StepCobro from '@/components/wizard/StepCobro'
import StepAsegurado from '@/components/wizard/StepAsegurado'
import StepPlan from '@/components/wizard/StepPlan'
import StepBeneficiarios from '@/components/wizard/StepBeneficiarios'
import StepDocumentos from '@/components/wizard/StepDocumentos'
import StepTarifario from '@/components/wizard/StepTarifario'
import StepReview from '@/components/wizard/StepReview'
import { FormData, INITIAL_FORM_DATA } from '@/lib/types'

const STORAGE_KEY = 'solicitud_vidamas_form'

export default function SolicitudPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [formData, setFormDataState] = useState<FormData>(() => {
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
    setCurrentStep(prev => Math.min(prev + 1, 9))
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

      {/* Agent selected banner */}
      {formData.nombre_agente && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex items-center gap-2">
          <span className="text-green-600 text-lg">✓</span>
          <p className="text-sm text-green-800">
            <span className="font-semibold">{formData.nombre_agente}</span>
            {' '} — Folio: <span className="font-mono">{formData.folio}</span>
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
        {currentStep === 6 && <StepTarifario {...stepProps} />}
        {currentStep === 7 && <StepBeneficiarios {...stepProps} />}
        {currentStep === 8 && <StepDocumentos {...stepProps} />}
        {currentStep === 9 && (
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
