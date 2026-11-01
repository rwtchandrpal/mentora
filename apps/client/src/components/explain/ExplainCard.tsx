import React, { useState } from 'react';
import {
  MAX_DEEP_DIVE_DEPTH,
  type ExplainCardDTO,
  type LearningMode,
} from '@mentora/shared';
import { RichMarkdownRenderer } from '../common/RichMarkdownRenderer.js';
import { DeepDiveSubCard } from './DeepDiveSubCard.js';
import { CardControls } from './CardControls.js';

export interface ExplainCardProps {
  card: ExplainCardDTO;
  isLatestVisibleCard: boolean;
  isGoingDeeper: boolean;
  onNext: () => void;
  onGoDeeper: () => void;
  suggestedSubTopics?: string[];
  onSelectSubTopic?: (subTopic: string) => void;
  onSwitchMode?: (mode: LearningMode) => void;
}

const STEP_TYPE_CONFIG: Record<
  string,
  { label: string; badgeClasses: string }
> = {
  intuition: {
    label: 'Intuition',
    badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  core_mechanism: {
    label: 'Core Mechanism',
    badgeClasses: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  example: {
    label: 'Applied Example',
    badgeClasses: 'bg-amber-50 text-amber-800 border-amber-300',
  },
  check_for_understanding: {
    label: 'Check for Understanding',
    badgeClasses: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  },
};

export const ExplainCard: React.FC<ExplainCardProps> = ({
  card,
  isLatestVisibleCard,
  isGoingDeeper,
  onNext,
  onGoDeeper,
  suggestedSubTopics,
  onSelectSubTopic,
  onSwitchMode,
}) => {
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);

  const stepMeta = STEP_TYPE_CONFIG[card.stepType] ?? {
    label: card.stepType,
    badgeClasses: 'bg-gray-50 text-gray-800 border-gray-300',
  };

  const hasCFU = card.stepNumber === 4 || Boolean(card.checkQuestion);
  const deepDives = card.deepDives ?? [];
  const canGoDeeper = deepDives.length < MAX_DEEP_DIVE_DEPTH && !isGoingDeeper;

  return (
    <article
      id={`explain-card-${card.stepNumber}`}
      data-testid={`explain-card-${card.stepNumber}`}
      aria-label={`Step ${card.stepNumber}: ${card.title}`}
      className="w-full bg-white rounded-2xl border border-gray-200 p-5 sm:p-8 shadow-xs space-y-6 transition-all"
    >
      {/* Card Header */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-xs">
              {card.stepNumber}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stepMeta.badgeClasses}`}
            >
              {stepMeta.label}
            </span>
          </div>

          <span className="text-[11px] font-semibold text-slate-600">
            Progressive Card {card.stepNumber} of 4
          </span>
        </div>

        <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
          {card.title}
        </h3>
      </header>

      {/* Main Card Technical Content */}
      <div className="bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-800 shadow-xs">
        <RichMarkdownRenderer content={card.contentMarkdown} />
      </div>

      {/* Step 4 Check-for-Understanding (CFU) Section */}
      {hasCFU && (
        <section
          data-testid="cfu-section"
          aria-label="Check for Understanding Reflection"
          className="mt-6 p-4 sm:p-6 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-4"
        >
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs shadow-xs">
              ?
            </span>
            <h4 className="text-sm sm:text-base font-bold text-indigo-950">
              Check Your Understanding
            </h4>
          </div>

          {card.checkQuestion && (
            <div className="bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-800 shadow-xs">
              <RichMarkdownRenderer content={card.checkQuestion} />
            </div>
          )}

          {card.checkAnswer && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsAnswerRevealed((prev) => !prev)}
                aria-expanded={isAnswerRevealed}
                aria-controls={`cfu-answer-${card.stepNumber}`}
                className="inline-flex items-center px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500"
              >
                <span>{isAnswerRevealed ? 'Hide Answer' : 'Reveal Answer'}</span>
                <svg
                  className={`w-4 h-4 ml-1.5 transition-transform ${
                    isAnswerRevealed ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {isAnswerRevealed && (
                <div
                  id={`cfu-answer-${card.stepNumber}`}
                  data-testid="cfu-answer"
                  className="mt-3 bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-800 shadow-xs space-y-2"
                >
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-400">
                    <svg
                      className="w-4 h-4 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>Target Concept Answer & Derivation:</span>
                  </div>
                  <RichMarkdownRenderer content={card.checkAnswer} />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Nested Deep-Dive Sub-Cards (AC-EXP-03) */}
      {deepDives.length > 0 && (
        <div className="space-y-3 pt-2">
          {deepDives.map((deepDive, idx) => (
            <DeepDiveSubCard
              key={deepDive.id || `${card.stepNumber}-deep-${idx}`}
              deepDive={deepDive}
              index={idx}
            />
          ))}
        </div>
      )}

      {/* Card Controls */}
      <CardControls
        stepNumber={card.stepNumber}
        isLatestVisibleCard={isLatestVisibleCard}
        canAdvanceNext={card.stepNumber < 4}
        canGoDeeper={canGoDeeper}
        isGoingDeeper={isGoingDeeper}
        onNext={onNext}
        onGoDeeper={onGoDeeper}
        suggestedSubTopics={suggestedSubTopics}
        onSelectSubTopic={onSelectSubTopic}
        onSwitchMode={onSwitchMode}
      />
    </article>
  );
};

