import React, { useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_INTERACT_MESSAGE_LENGTH } from '@mentora/shared';

export interface ChatInputProps {
  onSendMessage: (message: string, forceDirectExplanation?: boolean) => void;
  isStreaming: boolean;
  disabled?: boolean;
  activeMilestoneTitle?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isStreaming,
  disabled = false,
  activeMilestoneTitle,
}) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e?: FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    const trimmed = message.trim();
    if (!trimmed || isStreaming || disabled) {
      return;
    }
    onSendMessage(trimmed, false);
    setMessage('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExplainDirectly = () => {
    if (isStreaming || disabled) {
      return;
    }
    onSendMessage('', true);
  };

  const isOverLimit = message.length > MAX_INTERACT_MESSAGE_LENGTH;
  const charsRemaining = MAX_INTERACT_MESSAGE_LENGTH - message.length;

  return (
    <div
      data-testid="chat-input-container"
      className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 shadow-xs space-y-3"
    >
      {/* Top Action Row: Escape Hatch Button + Context */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500 truncate max-w-xs sm:max-w-md">
          {activeMilestoneTitle ? (
            <span>
              Active Goal:{' '}
              <span className="font-semibold text-gray-700">
                {activeMilestoneTitle}
              </span>
            </span>
          ) : (
            <span>Guided Socratic Dialogue</span>
          )}
        </div>

        {/* FR-013: Manual Direct Explanation Escape Hatch */}
        <button
          type="button"
          data-testid="explain-directly-button"
          onClick={handleExplainDirectly}
          disabled={isStreaming || disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 active:bg-purple-200 border border-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-2xs"
          title="Skip Socratic questioning and request a direct explanation of this milestone"
        >
          <span className="text-purple-600">💡</span>
          Explain this milestone directly
        </button>
      </div>

      {/* Main Input Form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="relative">
          <textarea
            data-testid="chat-input-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isStreaming}
            rows={3}
            placeholder={
              disabled
                ? 'All milestones completed. Start Practice Mode or review above.'
                : isStreaming
                  ? 'Mentora is streaming a response...'
                  : 'Respond to Mentora or explain your thinking... (Press Enter to send, Shift+Enter for new line)'
            }
            className="w-full resize-none p-3 text-sm text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition-all"
          />
        </div>

        {/* Bottom Bar: Character Counter & Send Button */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span
            data-testid="char-counter"
            className={`text-xs ${
              isOverLimit
                ? 'text-rose-600 font-bold'
                : charsRemaining < 200
                  ? 'text-amber-600 font-medium'
                  : 'text-gray-400'
            }`}
          >
            {message.length} / {MAX_INTERACT_MESSAGE_LENGTH}
          </span>

          <button
            type="submit"
            data-testid="chat-send-button"
            disabled={!message.trim() || isStreaming || disabled || isOverLimit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs"
          >
            <span>{isStreaming ? 'Streaming...' : 'Send'}</span>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInput;

