import React from 'react';

export interface PracticeSummaryProps {
  easyScore: number;
  mediumScore: number;
  hardScore: number;
}

export const PracticeSummary: React.FC<PracticeSummaryProps> = ({
  easyScore,
  mediumScore,
  hardScore,
}) => {
  const totalScore = easyScore + mediumScore + hardScore;
  const percentage = Math.round((totalScore / 30) * 100);

  let masteryLabel = 'Foundational Progress';
  let badgeClasses = 'bg-amber-100 text-amber-900 border-amber-300';
  if (percentage >= 80) {
    masteryLabel = 'Topic Mastery Achieved';
    badgeClasses = 'bg-emerald-100 text-emerald-900 border-emerald-300';
  } else if (percentage >= 60) {
    masteryLabel = 'Proficient Understanding';
    badgeClasses = 'bg-indigo-100 text-indigo-900 border-indigo-300';
  }

  return (
    <section
      data-testid="practice-summary-card"
      aria-label="30-Question Topic Practice Summary"
      className="bg-linear-to-br from-indigo-900 via-indigo-800 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-md mb-8 border border-indigo-700/50"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Left: Overall Header and Badge */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-xs tracking-wide uppercase bg-white/10 text-indigo-100 border-indigo-400/30">
            <span>🏆 Full Curriculum Assessment Completed</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Topic Practice Summary
          </h2>
          <p className="text-sm text-indigo-200 max-w-xl">
            You completed all 30 assessment questions across Easy, Medium, and Hard tiers with verified derivations.
          </p>
          <div className="pt-1">
            <span
              data-testid="mastery-level-badge"
              className={`inline-block text-xs font-bold px-3 py-1 rounded-full border shadow-xs ${badgeClasses}`}
            >
              {masteryLabel}
            </span>
          </div>
        </div>

        {/* Right: Big Aggregate Score Display */}
        <div
          data-testid="total-score-display"
          className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/15 text-center shrink-0 min-w-[200px]"
        >
          <span className="text-xs uppercase tracking-wider text-indigo-200 font-semibold block mb-1">
            Total Score
          </span>
          <div className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            {totalScore} <span className="text-lg sm:text-xl font-medium text-indigo-300">/ 30</span>
          </div>
          <span className="text-xs font-semibold text-emerald-400 block mt-1">
            {percentage}% Overall Accuracy
          </span>
        </div>
      </div>

      {/* Tier Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6 pt-6 border-t border-indigo-700/60">
        <div
          data-testid="tier-score-easy"
          className="bg-white/5 rounded-xl p-3.5 border border-white/10 flex items-center justify-between"
        >
          <div className="text-left">
            <span className="text-xs text-indigo-200 block font-medium">Easy Tier</span>
            <span className="text-xs text-indigo-300/80">Foundational</span>
          </div>
          <div className="text-lg font-bold text-white">
            {easyScore} <span className="text-xs text-indigo-300 font-normal">/ 10</span>
          </div>
        </div>

        <div
          data-testid="tier-score-medium"
          className="bg-white/5 rounded-xl p-3.5 border border-white/10 flex items-center justify-between"
        >
          <div className="text-left">
            <span className="text-xs text-indigo-200 block font-medium">Medium Tier</span>
            <span className="text-xs text-indigo-300/80">Application</span>
          </div>
          <div className="text-lg font-bold text-white">
            {mediumScore} <span className="text-xs text-indigo-300 font-normal">/ 10</span>
          </div>
        </div>

        <div
          data-testid="tier-score-hard"
          className="bg-white/5 rounded-xl p-3.5 border border-white/10 flex items-center justify-between"
        >
          <div className="text-left">
            <span className="text-xs text-indigo-200 block font-medium">Hard Tier</span>
            <span className="text-xs text-indigo-300/80">Synthesis & Edge Cases</span>
          </div>
          <div className="text-lg font-bold text-white">
            {hardScore} <span className="text-xs text-indigo-300 font-normal">/ 10</span>
          </div>
        </div>
      </div>
    </section>
  );
};

