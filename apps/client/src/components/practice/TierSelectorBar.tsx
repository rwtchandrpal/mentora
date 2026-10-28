import React from 'react';
import {
  PracticeTier,
  BatchStatus,
  type PracticeBatchDTO,
} from '@mentora/shared';

export interface TierSelectorBarProps {
  activeTier: PracticeTier;
  batches: {
    easy: PracticeBatchDTO;
    medium: PracticeBatchDTO;
    hard: PracticeBatchDTO;
  };
  onSelectTier: (tier: PracticeTier) => void;
  disabled?: boolean;
}

interface TierConfig {
  tier: PracticeTier;
  label: string;
  subtitle: string;
  description: string;
}

const TIER_CONFIGS: TierConfig[] = [
  {
    tier: PracticeTier.EASY,
    label: 'Easy Tier',
    subtitle: '10 MCQs',
    description: 'Foundational definitions & recall',
  },
  {
    tier: PracticeTier.MEDIUM,
    label: 'Medium Tier',
    subtitle: '10 MCQs',
    description: 'Multi-step application & analysis',
  },
  {
    tier: PracticeTier.HARD,
    label: 'Hard Tier',
    subtitle: '10 MCQs',
    description: 'Complex edge cases & synthesis',
  },
];

export const TierSelectorBar: React.FC<TierSelectorBarProps> = ({
  activeTier,
  batches,
  onSelectTier,
  disabled = false,
}) => {
  return (
    <div className="w-full bg-white rounded-2xl p-3 sm:p-4 border border-gray-200 shadow-xs mb-6">
      <div
        role="tablist"
        aria-label="Practice difficulty tiers"
        className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4"
      >
        {TIER_CONFIGS.map((config) => {
          const batch = batches[config.tier];
          const isSelected = activeTier === config.tier;
          const isLocked = batch.status === BatchStatus.LOCKED;
          const isCompleted = batch.status === BatchStatus.COMPLETED;
          const isInProgress = batch.status === BatchStatus.IN_PROGRESS;

          const lockTooltip =
            config.tier === PracticeTier.MEDIUM
              ? 'Complete Easy batch to unlock'
              : 'Complete Medium batch to unlock';

          return (
            <button
              key={config.tier}
              role="tab"
              id={`tab-tier-${config.tier}`}
              data-testid={`tier-tab-${config.tier}`}
              aria-selected={isSelected}
              aria-controls={`tier-panel-${config.tier}`}
              aria-disabled={isLocked || disabled}
              disabled={isLocked || disabled}
              onClick={() => {
                if (!isLocked && !disabled) {
                  onSelectTier(config.tier);
                }
              }}
              title={isLocked ? lockTooltip : `${config.label} - ${config.description}`}
              className={`relative flex flex-col p-3 sm:p-3.5 rounded-xl border text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-500/20'
                  : isLocked
                  ? 'border-gray-200 bg-gray-50/70 text-gray-400 cursor-not-allowed opacity-75'
                  : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50/50 text-gray-700 cursor-pointer'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span
                  className={`font-semibold text-xs sm:text-sm ${
                    isSelected
                      ? 'text-indigo-950'
                      : isLocked
                      ? 'text-gray-400'
                      : 'text-gray-800'
                  }`}
                >
                  {config.label}
                </span>

                {/* Status Badges */}
                {isLocked && (
                  <span
                    data-testid={`tier-locked-badge-${config.tier}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"
                  >
                    <svg
                      className="w-3 h-3 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    Locked
                  </span>
                )}

                {isCompleted && (
                  <span
                    data-testid={`tier-completed-badge-${config.tier}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
                  >
                    <svg
                      className="w-3 h-3 text-emerald-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {batch.score !== null ? `${batch.score} / 10` : 'Completed'}
                  </span>
                )}

                {isInProgress && (
                  <span
                    data-testid={`tier-progress-badge-${config.tier}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full"
                  >
                    In Progress
                  </span>
                )}

                {!isLocked && !isCompleted && !isInProgress && (
                  <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    Start
                  </span>
                )}
              </div>

              <div className="text-[11px] sm:text-xs text-gray-500 line-clamp-1">
                {isLocked ? lockTooltip : config.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

