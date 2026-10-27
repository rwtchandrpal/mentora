import React from 'react';
import { useQuotaStatus } from '../../hooks/useQuotaStatus.js';

export const QuotaBadge: React.FC = () => {
  const { used, limit, remaining, isExhausted, formattedResetTime, percentageUsed } =
    useQuotaStatus();

  if (isExhausted) {
    return (
      <div
        role="status"
        aria-label="AI daily usage quota exhausted"
        className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1.5 shadow-sm"
      >
        <div className="flex items-center space-x-1.5 font-semibold text-amber-800">
          <svg
            className="w-4 h-4 text-amber-600 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>Daily Quota Reached</span>
        </div>
        <p className="text-[11px] text-amber-700 leading-tight">
          You've used all {limit} AI actions today. Quota resets at {formattedResetTime}.
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="AI daily usage quota"
      className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1.5"
    >
      <div className="flex items-center justify-between font-medium text-gray-700">
        <span className="flex items-center space-x-1">
          <svg
            className="w-3.5 h-3.5 text-indigo-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <span>Daily AI Quota</span>
        </span>
        <span className="font-semibold text-gray-900">
          {remaining} / {limit} left
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            percentageUsed > 80 ? 'bg-amber-500' : 'bg-indigo-600'
          }`}
          style={{ width: `${percentageUsed}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-500 text-right">
        {used} used today
      </p>
    </div>
  );
};

export default QuotaBadge;
