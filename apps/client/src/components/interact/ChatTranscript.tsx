import React, { useEffect, useRef } from 'react';
import {
  ChatRole,
  type InteractMessageDTO,
} from '@mentora/shared';
import { RichMarkdownRenderer } from '../common/RichMarkdownRenderer.js';
import { StreamingBubble } from './StreamingBubble.js';

export interface ChatTranscriptProps {
  messages: InteractMessageDTO[];
  isStreaming: boolean;
  streamBuffer: string;
  streamError: string | null;
  activeTurnMessage: string | null;
  onRetry?: () => void;
}

export const ChatTranscript: React.FC<ChatTranscriptProps> = ({
  messages,
  isStreaming,
  streamBuffer,
  streamError,
  activeTurnMessage,
  onRetry,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new message, streaming buffer delta, or error
  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, streamBuffer, streamError, activeTurnMessage]);

  return (
    <div
      data-testid="chat-transcript"
      className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6"
    >
      {messages.length === 0 && !isStreaming && !streamError && (
        <div className="flex flex-col items-center justify-center h-full text-center py-12 text-gray-700">
          <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xl mb-3">
            I
          </div>
          <p className="text-sm font-semibold text-gray-800">
            Initializing Socratic Dialogue...
          </p>
          <p className="text-xs text-gray-600 font-medium mt-1 max-w-sm">
            Mentora is analyzing your topic and decomposing it into guided discovery milestones.
          </p>
        </div>
      )}

      {/* Historical Messages List */}
      {messages.map((msg) => {
        const isUser = msg.role === ChatRole.USER;

        if (isUser) {
          return (
            <div
              key={msg.id}
              data-testid={`chat-message-user-${msg.id}`}
              className="flex items-start gap-3 max-w-2xl ml-auto justify-end text-right"
            >
              <div className="flex-1 bg-indigo-600 text-white rounded-2xl rounded-tr-xs p-4 shadow-xs text-left">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-white">You</span>
                  <span className="text-[10px] font-medium text-indigo-100">
                    Milestone {msg.milestoneNumber}
                  </span>
                </div>
                <div className="prose prose-sm prose-invert max-w-none">
                  <RichMarkdownRenderer content={msg.content} />
                </div>
              </div>

              {/* User Avatar */}
              <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-700 text-white flex items-center justify-center font-bold text-xs shadow-xs mt-1">
                U
              </div>
            </div>
          );
        }

        // Assistant Message
        return (
          <div
            key={msg.id}
            data-testid={`chat-message-assistant-${msg.id}`}
            className="flex items-start gap-3 max-w-3xl mr-auto text-left"
          >
            {/* Mentora Assistant Avatar */}
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs mt-1">
              M
            </div>

            <div className="flex-1 bg-white border border-gray-200 rounded-2xl rounded-tl-xs p-4 sm:p-5 shadow-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-900">
                  Mentora Tutor
                </span>
                <span className="text-[10px] font-semibold text-slate-600">
                  Milestone {msg.milestoneNumber}
                </span>
              </div>

              {/* Circuit Breaker / Direct Explanation Badge */}
              {msg.isCircuitBreakerExplanation && (
                <div
                  data-testid="circuit-breaker-banner"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300"
                >
                  <span className="text-amber-700">💡</span>
                  <span>Direct explanation provided after guided Socratic review</span>
                </div>
              )}

              {/* Markdown Content */}
              <div className="prose prose-sm max-w-none text-gray-900">
                <RichMarkdownRenderer content={msg.content} />
              </div>
            </div>
          </div>
        );
      })}

      {/* In-Flight User Message during streaming or stream failure */}
      {activeTurnMessage && (isStreaming || streamError) && (
        <div
          data-testid="chat-message-user-inflight"
          className="flex items-start gap-3 max-w-2xl ml-auto justify-end text-right animate-fade-in"
        >
          <div className="flex-1 bg-indigo-600 text-white rounded-2xl rounded-tr-xs p-4 shadow-xs text-left">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold text-white">You</span>
              {isStreaming && (
                <span className="text-[10px] text-indigo-100 font-medium animate-pulse">
                  Sending...
                </span>
              )}
            </div>
            <div className="prose prose-sm prose-invert max-w-none">
              <RichMarkdownRenderer content={activeTurnMessage} />
            </div>
          </div>

          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-700 text-white flex items-center justify-center font-bold text-xs shadow-xs mt-1">
            U
          </div>
        </div>
      )}

      {/* Streaming Assistant Bubble */}
      <StreamingBubble
        streamBuffer={streamBuffer}
        isStreaming={isStreaming}
        streamError={streamError}
        onRetry={onRetry}
      />

      {/* Scroll Anchor */}
      <div ref={bottomRef} className="h-1" />
    </div>
  );
};

export default ChatTranscript;
