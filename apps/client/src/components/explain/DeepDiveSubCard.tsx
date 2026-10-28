import React from 'react';
import type { DeepDiveSubCardDTO } from '@mentora/shared';
import { RichMarkdownRenderer } from '../common/RichMarkdownRenderer.js';

export interface DeepDiveSubCardProps {
  deepDive: DeepDiveSubCardDTO;
  index: number;
}

export const DeepDiveSubCard: React.FC<DeepDiveSubCardProps> = ({ deepDive, index }) => {
  return (
    <section
      aria-label={`Deep dive ${index + 1}: ${deepDive.title}`}
      data-testid={`deep-dive-card-${deepDive.id}`}
      className="ml-2 sm:ml-6 my-4 pl-4 sm:pl-6 border-l-4 border-indigo-500 rounded-r-2xl bg-indigo-50/40 border border-indigo-100/60 p-4 sm:p-6 space-y-4 shadow-xs"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 pb-3">
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white shadow-xs">
            Depth {deepDive.depthLevel}
          </span>
          <span className="text-xs font-medium text-indigo-900">
            Deep Dive #{index + 1}
          </span>
        </div>
        <div className="inline-flex items-center text-xs text-indigo-700 bg-white/80 border border-indigo-200/60 px-2 py-0.5 rounded-md">
          <svg
            className="w-3.5 h-3.5 mr-1 text-indigo-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Reasoning Engine
        </div>
      </div>

      {/* Sub-Card Title */}
      <div>
        <h4 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
          {deepDive.title}
        </h4>
      </div>

      {/* Rich Technical Content (Markdown, LaTeX, Diagrams, Code) */}
      <div className="bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-800 shadow-xs">
        <RichMarkdownRenderer content={deepDive.contentMarkdown} />
      </div>
    </section>
  );
};

