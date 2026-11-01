import React from 'react';
import { RichMarkdownRenderer } from '../common/RichMarkdownRenderer.js';

export interface StreamingBubbleProps {
  streamBuffer: string;
  isStreaming: boolean;
  streamError: string | null;
  onRetry?: () => void;
}

export const StreamingBubble: React.FC<StreamingBubbleProps> = ({
  streamBuffer,
  isStreaming,
  streamError,
  onRetry,
}) => {
  if (!isStreaming && !streamError) {
    return null;
  }

  return (
    <div
      data-testid="streaming-bubble"
      className="flex items-start gap-3 max-w-3xl mr-auto animate-fade-in"
    >
      {/* Mentora Assistant Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs mt-1">
        M
      </div>

      <div className="flex-1 bg-white border border-purple-200/80 rounded-2xl rounded-tl-xs p-4 sm:p-5 shadow-xs text-left">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-purple-950">
            Mentora Tutor
          </span>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-ping" />
              Thinking...
            </span>
          )}
        </div>

        {/* Loading / Thinking dots when stream has started but no tokens yet */}
        {isStreaming && !streamBuffer && !streamError && (
          <div
            data-testid="streaming-thinking-indicator"
            className="flex items-center gap-1.5 py-2 text-purple-700"
          >
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" />
            <span
              className="w-2 h-2 rounded-full bg-purple-600 animate-bounce"
              style={{ animationDelay: '0.15s' }}
            />
            <span
              className="w-2 h-2 rounded-full bg-purple-700 animate-bounce"
              style={{ animationDelay: '0.3s' }}
            />
            <span className="text-xs text-gray-600 font-medium ml-2">
              Formulating guided Socratic response...
            </span>
          </div>
        )}

        {/* Streamed Markdown Content */}
        {streamBuffer.length > 0 && (
          <div className="prose prose-sm max-w-none text-gray-900">
            <RichMarkdownRenderer content={streamBuffer} />
            {isStreaming && (
              <span
                data-testid="streaming-cursor"
                className="inline-block w-2 h-4 bg-purple-600 animate-pulse ml-0.5 align-middle"
              />
            )}
          </div>
        )}

        {/* Network Interruption / Stream Error Alert (Edge Case 4) */}
        {streamError && (
          <div
            data-testid="stream-error-banner"
            className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-rose-600 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>{streamError}</span>
            </div>

            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 transition-colors shadow-xs flex-shrink-0"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Connection interrupted — Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StreamingBubble;
