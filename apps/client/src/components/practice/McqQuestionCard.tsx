import React, { useState } from 'react';
import type { McqQuestionMaskedDTO, McqQuestionFullDTO } from '@mentora/shared';
import { RichMarkdownRenderer } from '../common/RichMarkdownRenderer.js';

export interface McqQuestionCardProps {
  question: McqQuestionMaskedDTO | McqQuestionFullDTO;
  selectedOptionIndex: number | null;
  onSelectOption: (optionIndex: number) => void;
  disabled?: boolean;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export const McqQuestionCard: React.FC<McqQuestionCardProps> = ({
  question,
  selectedOptionIndex,
  onSelectOption,
  disabled = false,
}) => {
  const [showHint, setShowHint] = useState(false);

  return (
    <article
      data-testid={`mcq-card-${question.questionNumber}`}
      aria-labelledby={`question-title-${question.questionNumber}`}
      className="bg-white rounded-2xl p-5 sm:p-7 border border-gray-200 shadow-xs mb-6 transition-all"
    >
      {/* Question Header: Number + Hint Toggle */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
        <span
          id={`question-title-${question.questionNumber}`}
          className="text-xs sm:text-sm font-semibold tracking-wide text-indigo-700 uppercase"
        >
          Question {question.questionNumber} of 10
        </span>

        {question.hint && (
          <button
            type="button"
            data-testid={`hint-toggle-${question.questionNumber}`}
            onClick={() => setShowHint((prev) => !prev)}
            aria-expanded={showHint}
            aria-controls={`hint-container-${question.questionNumber}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors text-amber-700 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <svg
              className="w-3.5 h-3.5 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            {showHint ? 'Hide Hint' : 'Show Hint'}
          </button>
        )}
      </div>

      {/* Collapsible Hint Block */}
      {showHint && question.hint && (
        <div
          id={`hint-container-${question.questionNumber}`}
          data-testid={`hint-content-${question.questionNumber}`}
          className="mb-5 p-3.5 sm:p-4 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-950 text-xs sm:text-sm animate-fadeIn"
        >
          <div className="font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
            <span>💡 Conceptual Hint:</span>
          </div>
          <RichMarkdownRenderer content={question.hint} className="text-amber-900" />
        </div>
      )}

      {/* Question Stem (supports LaTeX equations, Code, and Markdown) */}
      <div className="mb-6 text-sm sm:text-base text-gray-900 leading-relaxed font-normal">
        <RichMarkdownRenderer content={question.questionText} />
      </div>

      {/* 4 Accessible Radio Options (A, B, C, D) */}
      <div
        role="radiogroup"
        aria-label={`Options for question ${question.questionNumber}`}
        className="space-y-2.5 sm:space-y-3"
      >
        {question.options.map((optionText, optIdx) => {
          const isSelected = selectedOptionIndex === optIdx;
          const label = OPTION_LABELS[optIdx] ?? String(optIdx + 1);

          return (
            <div
              key={optIdx}
              role="radio"
              aria-checked={isSelected}
              tabIndex={disabled ? -1 : 0}
              data-testid={`mcq-option-${question.questionNumber}-${optIdx}`}
              onClick={() => {
                if (!disabled) {
                  onSelectOption(optIdx);
                }
              }}
              onKeyDown={(e) => {
                if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
                  e.preventDefault();
                  onSelectOption(optIdx);
                }
              }}
              className={`flex items-start gap-3 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                disabled
                  ? 'opacity-60 cursor-not-allowed'
                  : isSelected
                  ? 'border-indigo-600 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-500/20'
                  : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50/50'
              }`}
            >
              {/* Option Letter Badge (A, B, C, D) */}
              <div
                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 border border-gray-200'
                }`}
              >
                {label}
              </div>

              {/* Option Text rendered with RichMarkdownRenderer */}
              <div className="flex-1 text-xs sm:text-sm text-gray-800 pt-0.5">
                <RichMarkdownRenderer content={optionText} />
              </div>

              {/* Radio Indicator */}
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                  isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                }`}
                aria-hidden="true"
              >
                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
};

