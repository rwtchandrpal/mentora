import React from 'react';
import {
  MilestoneStatus,
  type InteractMilestoneDTO,
} from '@mentora/shared';

export interface MilestoneTrackerBarProps {
  milestones: InteractMilestoneDTO[];
  activeMilestoneIndex: number;
  strikeCount: number;
  isCompleted?: boolean;
}

export const MilestoneTrackerBar: React.FC<MilestoneTrackerBarProps> = ({
  milestones,
  activeMilestoneIndex,
  strikeCount,
  isCompleted = false,
}) => {
  const completedCount = milestones.filter(
    (m) => m.status === MilestoneStatus.COMPLETED
  ).length;

  return (
    <section
      aria-label="Milestone Progress"
      className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-xs"
    >
      {/* Header Row: Title, Counter, and Socratic Strike Hint */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse" />
          <h2 className="text-sm font-semibold text-gray-900 tracking-tight">
            Conceptual Milestones
          </h2>
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {completedCount} of {milestones.length} Completed
          </span>
        </div>

        {/* Socratic Strike Hint Indicator */}
        {!isCompleted && strikeCount > 0 && (
          <div
            data-testid="strike-indicator"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              strikeCount === 1
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-orange-50 text-orange-800 border border-orange-200 animate-pulse'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {strikeCount === 1
              ? 'Socratic Nudge Active (Strike 1/3)'
              : 'Concrete Hint Active (Strike 2/3)'}
          </div>
        )}

        {isCompleted && (
          <span
            data-testid="milestones-completed-badge"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            All Milestones Mastered
          </span>
        )}
      </div>

      {/* Milestone Step Grid / Badges */}
      <ol
        className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3"
        role="list"
      >
        {milestones.map((milestone, idx) => {
          const isCurrentActive =
            !isCompleted &&
            (idx === activeMilestoneIndex || milestone.status === MilestoneStatus.ACTIVE);
          const isStepCompleted = milestone.status === MilestoneStatus.COMPLETED;
          const isPending = !isStepCompleted && !isCurrentActive;

          return (
            <li
              key={milestone.milestoneNumber}
              aria-current={isCurrentActive ? 'step' : undefined}
              className={`relative flex flex-col p-3 rounded-xl border transition-all text-left ${
                isStepCompleted
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                  : isCurrentActive
                    ? 'bg-purple-50/80 border-purple-300 ring-2 ring-purple-500/20 shadow-xs'
                    : 'bg-gray-50/50 border-gray-200 text-gray-500 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold tracking-wider uppercase opacity-75">
                  Milestone {milestone.milestoneNumber}
                </span>

                {isStepCompleted && (
                  <span
                    data-testid={`milestone-completed-${milestone.milestoneNumber}`}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white"
                  >
                    <svg
                      className="w-3 h-3"
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
                  </span>
                )}

                {isCurrentActive && (
                  <span
                    data-testid={`milestone-active-${milestone.milestoneNumber}`}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold shadow-xs animate-pulse"
                  >
                    {milestone.milestoneNumber}
                  </span>
                )}

                {isPending && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[11px] font-medium">
                    {milestone.milestoneNumber}
                  </span>
                )}
              </div>

              <h3
                className={`text-xs font-semibold line-clamp-1 ${
                  isStepCompleted
                    ? 'text-emerald-900'
                    : isCurrentActive
                      ? 'text-purple-950 font-bold'
                      : 'text-gray-700'
                }`}
                title={milestone.title}
              >
                {milestone.title}
              </h3>

              <p
                className={`text-[11px] mt-1 line-clamp-2 leading-relaxed ${
                  isStepCompleted
                    ? 'text-emerald-800/80'
                    : isCurrentActive
                      ? 'text-purple-800'
                      : 'text-gray-500'
                }`}
                title={milestone.description}
              >
                {milestone.description}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default MilestoneTrackerBar;

