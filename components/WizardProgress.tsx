'use client'

interface Step {
  id: number
  label: string
  shortLabel: string
}

const STEPS: Step[] = [
  { id: 1, label: 'Agente', shortLabel: 'Agente' },
  { id: 2, label: 'Contratante', shortLabel: 'Contrat.' },
  { id: 3, label: 'Forma de Cobro', shortLabel: 'Cobro' },
  { id: 4, label: 'Asegurado', shortLabel: 'Aseg.' },
  { id: 5, label: 'Plan', shortLabel: 'Plan' },
  { id: 6, label: 'Beneficiarios', shortLabel: 'Benef.' },
  { id: 7, label: 'Documentos', shortLabel: 'Docs' },
  { id: 8, label: 'Revisión', shortLabel: 'Rev.' },
]

interface WizardProgressProps {
  currentStep: number
  completedSteps: Set<number>
  onStepClick?: (step: number) => void
}

export default function WizardProgress({ currentStep, completedSteps, onStepClick }: WizardProgressProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      {/* Step counter */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">
          Paso {currentStep} de {STEPS.length}
        </span>
        <span className="text-sm text-[#003087] font-semibold">
          {STEPS[currentStep - 1]?.label}
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div 
          className="bg-[#003087] h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />
      </div>

      {/* Step dots - scrollable on mobile */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {STEPS.map((step) => {
          const isCompleted = completedSteps.has(step.id)
          const isCurrent = step.id === currentStep
          const isClickable = isCompleted && onStepClick
          
          return (
            <button
              key={step.id}
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable && !isCurrent}
              className={`
                flex-shrink-0 flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-xs
                transition-all duration-200
                ${isCurrent ? 'bg-[#003087] text-white' : ''}
                ${isCompleted && !isCurrent ? 'bg-green-100 text-green-700 cursor-pointer hover:bg-green-200' : ''}
                ${!isCompleted && !isCurrent ? 'text-gray-400 cursor-default' : ''}
              `}
            >
              <span className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${isCurrent ? 'bg-white text-[#003087]' : ''}
                ${isCompleted && !isCurrent ? 'bg-green-500 text-white' : ''}
                ${!isCompleted && !isCurrent ? 'bg-gray-200 text-gray-400' : ''}
              `}>
                {isCompleted && !isCurrent ? '✓' : step.id}
              </span>
              <span className="hidden sm:block">{step.shortLabel}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
