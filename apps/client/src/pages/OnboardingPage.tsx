import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  EducationLevel,
  ExplanationStyle,
  StaticLearnerProfileInputSchema,
} from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import { updateProfileThunk } from '../store/authSlice.js';

interface EducationOption {
  value: EducationLevel;
  title: string;
  description: string;
  badge: string;
}

interface StyleOption {
  value: ExplanationStyle;
  title: string;
  description: string;
  badge: string;
}

const EDUCATION_OPTIONS: EducationOption[] = [
  {
    value: EducationLevel.HIGH_SCHOOL,
    title: 'High School',
    description: 'Relatable foundations, intuitive analogies & clear step-by-step guidance.',
    badge: 'Foundations',
  },
  {
    value: EducationLevel.UNDERGRADUATE,
    title: 'Undergraduate',
    description: 'Rigorous intuition, formal mathematical derivations & analytical problem-solving.',
    badge: 'In-Depth',
  },
  {
    value: EducationLevel.PROFESSIONAL,
    title: 'Professional',
    description: 'Rapid conceptual models, system architecture tradeoffs & practical industry application.',
    badge: 'Applied',
  },
];

const STYLE_OPTIONS: StyleOption[] = [
  {
    value: ExplanationStyle.VISUAL,
    title: 'Visual & Structured',
    description: 'Emphasizes architecture diagrams, flowcharts, and comparative tables.',
    badge: 'Diagrams',
  },
  {
    value: ExplanationStyle.ANALOGY_HEAVY,
    title: 'Analogy-Heavy',
    description: 'Grounds abstract theories in real-world metaphors before introducing academic jargon.',
    badge: 'Metaphors',
  },
  {
    value: ExplanationStyle.CONCISE_TECHNICAL,
    title: 'Concise & Technical',
    description: 'Direct, mathematically precise definitions, code samples, and algorithmic edge cases.',
    badge: 'Formal',
  },
];

export const OnboardingPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, error: apiError } = useAppSelector((state) => state.auth);

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedEducation, setSelectedEducation] = useState<EducationLevel | null>(
    user?.profile?.educationLevel ?? null
  );
  const [selectedStyle, setSelectedStyle] = useState<ExplanationStyle | null>(
    user?.profile?.preferredStyle ?? null
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNextStep = () => {
    if (!selectedEducation) {
      setValidationError('Please select your education or experience level to continue.');
      return;
    }
    setValidationError(null);
    setStep(2);
  };

  const handlePrevStep = () => {
    setValidationError(null);
    setStep(1);
  };

  const handleComplete = async () => {
    if (!selectedEducation || !selectedStyle) {
      setValidationError('Please select both an education level and explanation style.');
      return;
    }

    const validation = StaticLearnerProfileInputSchema.safeParse({
      educationLevel: selectedEducation,
      preferredStyle: selectedStyle,
    });

    if (!validation.success) {
      setValidationError('Invalid profile options selected. Please re-check your choices.');
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      const resultAction = await dispatch(updateProfileThunk(validation.data));
      if (updateProfileThunk.fulfilled.match(resultAction)) {
        navigate('/workspace', { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user?.profile?.isCompleted === true) {
    return <Navigate to="/workspace" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl w-full mx-auto space-y-8 bg-white p-8 sm:p-10 rounded-2xl shadow-sm border border-gray-200">
        {/* Header and Step Indicator */}
        <div>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-2">
            <span>Step {step} of 2</span>
            <span>{step === 1 ? '50% Completed' : '95% Completed'}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: step === 1 ? '50%' : '100%' }}
            />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {step === 1
              ? 'What is your current learning background?'
              : 'How do you prefer concepts explained?'}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {step === 1
              ? 'Mentora calibrates vocabulary, mathematical depth, and problem context based on your background.'
              : 'Choose the pedagogical presentation style that best resonates with your mental models.'}
          </p>
        </div>

        {/* Validation or API Error Alert */}
        {(validationError || apiError) && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
          >
            <p className="font-semibold">Attention needed</p>
            <p>{validationError || apiError?.message}</p>
          </div>
        )}

        {/* Step 1: Education Level Selector */}
        {step === 1 && (
          <div
            role="radiogroup"
            aria-label="Education or Experience Level"
            className="space-y-3"
          >
            {EDUCATION_OPTIONS.map((option) => {
              const isSelected = selectedEducation === option.value;
              return (
                <div
                  key={option.value}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => {
                    setSelectedEducation(option.value);
                    setValidationError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setSelectedEducation(option.value);
                      setValidationError(null);
                    }
                  }}
                  className={`cursor-pointer p-5 rounded-xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-gray-900 text-base">
                        {option.title}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                        {option.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                  <div className="flex items-center sm:self-center">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Step 2: Explanation Style Selector */}
        {step === 2 && (
          <div
            role="radiogroup"
            aria-label="Preferred Explanation Style"
            className="space-y-3"
          >
            {STYLE_OPTIONS.map((option) => {
              const isSelected = selectedStyle === option.value;
              return (
                <div
                  key={option.value}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => {
                    setSelectedStyle(option.value);
                    setValidationError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setSelectedStyle(option.value);
                      setValidationError(null);
                    }
                  }}
                  className={`cursor-pointer p-5 rounded-xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-gray-900 text-base">
                        {option.title}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                        {option.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                  <div className="flex items-center sm:self-center">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="pt-4 flex items-center justify-between gap-4">
          {step === 2 ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="py-2.5 px-5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step === 1 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="ml-auto py-2.5 px-6 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Continue to Step 2
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleComplete}
              className="ml-auto py-2.5 px-6 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Saving Profile...' : 'Complete & Start Learning'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
