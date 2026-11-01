import React from 'react';
import {
  PracticeTier,
  BatchStatus,
  type PracticeBatchDTO,
  type McqQuestionFullDTO,
} from '@mentora/shared';
import { RichMarkdownRenderer } from '../common/RichMarkdownRenderer.js';

export interface BatchReviewViewProps {
  tier: PracticeTier;
  batch: PracticeBatchDTO;
  batches: {
    easy: PracticeBatchDTO;
    medium: PracticeBatchDTO;
    hard: PracticeBatchDTO;
  };
  onStartNextTier: (nextTier: PracticeTier) => void;
  onSelectTier: (tier: PracticeTier) => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export const BatchReviewView: React.FC<BatchReviewViewProps> = ({
  tier,
  batch,
  batches,
  onStartNextTier,
  onSelectTier,
}) => {
  const isCompleted = batch.status === BatchStatus.COMPLETED;
  const score = batch.score ?? 0;
  const percentage = Math.round((score / 10) * 100);

  // Determine next tier availability
  let nextTierConfig: {
    tier: PracticeTier;
    label: string;
    isStarted: boolean;
  } | null = null;

  if (tier === PracticeTier.EASY) {
    const mediumStatus = batches.medium.status;
    nextTierConfig = {
      tier: PracticeTier.MEDIUM,
      label: 'Medium Batch (10 Questions)',
      isStarted: mediumStatus !== BatchStatus.NOT_STARTED && mediumStatus !== BatchStatus.LOCKED,
    };
  } else if (tier === PracticeTier.MEDIUM) {
    const hardStatus = batches.hard.status;
    nextTierConfig = {
      tier: PracticeTier.HARD,
      label: 'Hard Batch (10 Questions)',
      isStarted: hardStatus !== BatchStatus.NOT_STARTED && hardStatus !== BatchStatus.LOCKED,
    };
  }

  // Cast questions if batch is completed
  const questions: McqQuestionFullDTO[] = isCompleted
    ? (batch.questions as McqQuestionFullDTO[])
    : [];

  return (
    <div data-testid="batch-review-view" className="space-y-6">
      {/* Batch Score Banner */}
      <div
        data-testid="batch-score-banner"
        className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full">
              {tier.toUpperCase()} TIER REVIEW
            </span>
            <span className="text-xs text-gray-600 font-bold">•</span>
            <span className="text-xs text-gray-700 font-semibold">10 Questions Completed</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Batch Score: {score} / 10 ({percentage}%)
          </h2>
          <p className="text-sm text-gray-700">
            {percentage >= 80
              ? 'Outstanding performance! You have demonstrated strong conceptual mastery for this tier.'
              : percentage >= 60
              ? 'Solid effort! Review the step-by-step rationales below to solidify any missing concepts.'
              : 'Keep going! Review each detailed derivation below before taking on the next difficulty tier.'}
          </p>
        </div>

        {/* Next Tier Progression CTA Button (AC-PRC-03) */}
        {nextTierConfig && (
          <div className="shrink-0 pt-2 sm:pt-0">
            <button
              type="button"
              data-testid={`start-next-tier-btn-${nextTierConfig.tier}`}
              onClick={() => {
                if (nextTierConfig?.isStarted) {
                  onSelectTier(nextTierConfig.tier);
                } else if (nextTierConfig) {
                  onStartNextTier(nextTierConfig.tier);
                }
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <span>
                {nextTierConfig.isStarted
                  ? `View ${nextTierConfig.label}`
                  : `Start ${nextTierConfig.label}`}
              </span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Question-by-Question Review List */}
      <div className="space-y-6">
        {questions.map((q, qIdx) => {
          const userAnswer = batch.userAnswers[qIdx];
          const isCorrect = userAnswer === q.correctOptionIndex;

          return (
            <article
              key={q.questionNumber}
              data-testid={`review-card-${q.questionNumber}`}
              className="bg-white rounded-2xl p-5 sm:p-7 border border-gray-200 shadow-xs"
            >
              {/* Question Review Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
                <span className="text-xs sm:text-sm font-bold tracking-wide text-gray-700 uppercase">
                  Question {q.questionNumber} of 10
                </span>

                {isCorrect ? (
                  <span
                    data-testid={`review-badge-correct-${q.questionNumber}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
                  >
                    <svg
                      className="w-3.5 h-3.5 text-emerald-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Correct (+1)
                  </span>
                ) : (
                  <span
                    data-testid={`review-badge-incorrect-${q.questionNumber}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200"
                  >
                    <svg
                      className="w-3.5 h-3.5 text-rose-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Incorrect (0/1)
                  </span>
                )}
              </div>

              {/* Question Stem */}
              <div className="mb-5 text-sm sm:text-base text-gray-900 leading-relaxed font-normal">
                <RichMarkdownRenderer content={q.questionText} />
              </div>

              {/* 4 Choices with Choice vs. Correct Answer Badges */}
              <div className="space-y-2.5 sm:space-y-3 mb-5">
                {q.options.map((optionText, optIdx) => {
                  const isUserChoice = userAnswer === optIdx;
                  const isCorrectOption = q.correctOptionIndex === optIdx;
                  const label = OPTION_LABELS[optIdx] ?? String(optIdx + 1);

                  // Determine container styles
                  let containerStyles =
                    'border-gray-200 bg-gray-50/50 text-gray-800';
                  if (isCorrectOption) {
                    containerStyles =
                      'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-medium ring-1 ring-emerald-500/30';
                  } else if (isUserChoice && !isCorrectOption) {
                    containerStyles =
                      'border-rose-400 bg-rose-50/70 text-rose-950 ring-1 ring-rose-400/30';
                  }

                  return (
                    <div
                      key={optIdx}
                      data-testid={`review-option-${q.questionNumber}-${optIdx}`}
                      className={`flex items-start justify-between gap-3 p-3.5 sm:p-4 rounded-xl border transition-all ${containerStyles}`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        {/* Option Letter Circle */}
                        <div
                          className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isCorrectOption
                              ? 'bg-emerald-600 text-white'
                              : isUserChoice
                              ? 'bg-rose-600 text-white'
                              : 'bg-gray-200 text-gray-800'
                          }`}
                        >
                          {label}
                        </div>

                        {/* Option Content */}
                        <div className="text-xs sm:text-sm pt-0.5 flex-1">
                          <RichMarkdownRenderer content={optionText} />
                        </div>
                      </div>

                      {/* Visual & Accessible Badges */}
                      <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
                        {isUserChoice && isCorrectOption && (
                          <span
                            data-testid={`badge-choice-correct-${q.questionNumber}`}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800"
                          >
                            ✓ Your Choice (Correct)
                          </span>
                        )}

                        {isUserChoice && !isCorrectOption && (
                          <span
                            data-testid={`badge-choice-incorrect-${q.questionNumber}`}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800"
                          >
                            ✗ Your Choice
                          </span>
                        )}

                        {!isUserChoice && isCorrectOption && (
                          <span
                            data-testid={`badge-correct-answer-${q.questionNumber}`}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800"
                          >
                            ✓ Correct Option
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Step-by-Step Derivation & Solution Explanation */}
              {q.solutionExplanation && (
                <div
                  data-testid={`explanation-block-${q.questionNumber}`}
                  className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 text-xs sm:text-sm text-indigo-950"
                >
                  <div className="font-bold text-indigo-900 mb-1 flex items-center gap-1.5">
                    <svg
                      className="w-4 h-4 text-indigo-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>Step-by-Step Explanation:</span>
                  </div>
                  <RichMarkdownRenderer
                    content={q.solutionExplanation}
                    className="text-indigo-900"
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};

