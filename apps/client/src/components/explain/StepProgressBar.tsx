import React from 'react';
import { EXPLAIN_CORE_STEPS_COUNT } from '@mentora/shared';

export interface StepInfo {
  stepNumber: number;
  label: string;
  shortDesc: string;
}

export const EXPLAIN_STEPS: readonly StepInfo[] = [
  { stepNumber: 1, label: 'Intuition', shortDesc: 'Mental model & analogy' },
  { stepNumber: 2, label: 'Core Mechanism', shortDesc: 'Rules & formulas' },
  { stepNumber: 3, label: 'Example', shortDesc: 'Applied demonstration' },
  { stepNumber: 4, label: 'Check-for-Understanding', shortDesc: 'Self-reflection check' },
] as const;

export interface StepProgressBarProps {
  currentStepIndex: number;
  totalSteps?: number;
  onSelectRevealedStep?: (index: number) => void;
}

export const StepProgressBar: React.FC<StepProgressBarProps> = ({
  currentStepIndex,
  totalSteps = EXPLAIN_CORE_STEPS_COUNT,
  onSelectRevealedStep,
}) => {
  const steps = EXPLAIN_STEPS.slice(0, totalSteps);

  return (
    <nav
      aria-label="Explain Mode Progress"
      className="w-full bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs"
    >
      <ol className="flex items-center justify-between w-full">
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isRevealed = index <= currentStepIndex;
          const isLocked = index > currentStepIndex;

          const isInteractive = isRevealed && typeof onSelectRevealedStep === 'function';

          return (
            <React.Fragment key={step.stepNumber}>
              {/* Step Node */}
              <li
                className="flex-1 flex flex-col items-center group relative min-w-0"
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div
                  role={isInteractive ? 'button' : undefined}
                  tabIndex={isInteractive ? 0 : undefined}
                  aria-label={`Step ${step.stepNumber}: ${step.label}${
                    isCompleted ? ' (Completed)' : isCurrent ? ' (Active)' : ' (Locked)'
                  }`}
                  aria-disabled={isLocked ? 'true' : undefined}
                  onClick={() => {
                    if (isInteractive) {
                      onSelectRevealedStep(index);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelectRevealedStep(index);
                    }
                  }}
                  className={`flex flex-col items-center text-center transition-all ${
                    isInteractive ? 'cursor-pointer hover:opacity-90' : isLocked ? 'cursor-not-allowed' : ''
                  }`}
                >
                  {/* Circle Badge */}
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm transition-all shadow-xs ${
                      isCurrent
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 scale-105'
                        : isCompleted
                        ? 'bg-indigo-50 border-2 border-indigo-600 text-indigo-700'
                        : 'bg-gray-100 border border-gray-300 text-gray-400'
                    }`}
                  >
                    {isCompleted ? (
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : isLocked ? (
                      <svg
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                    ) : (
                      step.stepNumber
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className={`mt-2 text-xs font-semibold truncate max-w-[80px] sm:max-w-[140px] ${
                      isCurrent
                        ? 'text-indigo-600'
                        : isCompleted
                        ? 'text-gray-800'
                        : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </span>

                  {/* Sub-label for desktop */}
                  <span className="hidden sm:inline-block text-[10px] text-gray-400 truncate max-w-[130px]">
                    {step.shortDesc}
                  </span>
                </div>
              </li>

              {/* Connecting Line between steps */}
              {index < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-1 sm:mx-2 transition-all self-center mb-6 sm:mb-7 ${
                    index < currentStepIndex ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

