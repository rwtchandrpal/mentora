import { useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import {
  startStreaming,
  appendStreamToken,
  setStreamError,
  finishStreaming,
  applyInteractMetadata,
} from '../store/sessionSlice.js';
import { setQuota } from '../store/authSlice.js';
import { getStoredToken } from '../services/apiClient.js';
import { env } from '../config/env.js';
import type {
  SseStartEventDTO,
  SseTokenEventDTO,
  SseMetadataEventDTO,
  SseErrorEventDTO,
} from '@mentora/shared';

export interface UseSseStreamReturn {
  sendMessage: (message: string, forceDirectExplanation?: boolean) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  abortStream: () => void;
  isStreaming: boolean;
  streamBuffer: string;
  streamError: string | null;
  activeTurnMessage: string | null;
}

export const useSseStream = (sessionId: string | undefined): UseSseStreamReturn => {
  const dispatch = useAppDispatch();
  const { isStreaming, streamBuffer, streamError, activeTurnMessage } = useAppSelector(
    (state) => state.session.streamingState
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastTurnRef = useRef<{ message: string; forceDirectExplanation?: boolean } | null>(null);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    dispatch(finishStreaming());
  }, [dispatch]);

  const sendMessage = useCallback(
    async (message: string, forceDirectExplanation = false) => {
      if (!sessionId) {
        return;
      }
      if (isStreaming) {
        return;
      }

      const trimmedMessage = message.trim();
      const effectiveMessage =
        trimmedMessage.length > 0
          ? trimmedMessage
          : forceDirectExplanation
            ? 'Please explain this milestone directly.'
            : '';

      if (!effectiveMessage) {
        return;
      }

      // Record last turn for retry support (Edge Case 4)
      lastTurnRef.current = { message: effectiveMessage, forceDirectExplanation };

      // Set up abort controller and dispatch start
      const controller = new AbortController();
      abortControllerRef.current = controller;

      dispatch(
        startStreaming({
          message: forceDirectExplanation ? '*(Requested direct explanation)*' : effectiveMessage,
        })
      );

      const token = getStoredToken();
      const url = `${env.VITE_API_BASE_URL}/sessions/${sessionId}/interact/stream`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: effectiveMessage,
            forceDirectExplanation,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errorMsg = `Server error (${response.status})`;
          try {
            const errJson = (await response.json()) as {
              error?: { code?: string; message?: string };
            };
            if (errJson?.error?.message) {
              errorMsg = errJson.error.message;
            }
          } catch {
            // Non-JSON error body fallback
          }
          dispatch(setStreamError(errorMsg));
          return;
        }

        if (!response.body) {
          dispatch(setStreamError('No response body received from server'));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          sseBuffer += decoder.decode(value, { stream: true });

          // SSE blocks are delimited by double newlines (\n\n or \r\n\r\n)
          const parts = sseBuffer.split(/\r?\n\r?\n/);
          sseBuffer = parts.pop() ?? '';

          for (const block of parts) {
            if (!block.trim()) {
              continue;
            }

            const lines = block.split(/\r?\n/);
            let eventType = 'message';
            let dataStr = '';

            for (const line of lines) {
              if (line.startsWith(':')) {
                // Keepalive comment (: keepalive), ignore per SSE standard
                continue;
              }
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                const lineData = line.slice(5).trim();
                dataStr = dataStr ? `${dataStr}\n${lineData}` : lineData;
              }
            }

            if (eventType === 'start') {
              try {
                const startData = JSON.parse(dataStr) as SseStartEventDTO;
                dispatch(startStreaming({ turnId: startData.turnId }));
              } catch {
                // Ignore parse errors on start frame
              }
            } else if (eventType === 'token') {
              try {
                const tokenData = JSON.parse(dataStr) as SseTokenEventDTO;
                if (typeof tokenData.delta === 'string') {
                  dispatch(appendStreamToken(tokenData.delta));
                }
              } catch {
                // Fallback to raw data string if plain string transmitted
                dispatch(appendStreamToken(dataStr));
              }
            } else if (eventType === 'metadata') {
              try {
                const metadataData = JSON.parse(dataStr) as SseMetadataEventDTO;
                dispatch(applyInteractMetadata(metadataData));
                if (metadataData.quota) {
                  dispatch(setQuota(metadataData.quota));
                }
              } catch (e) {
                console.error('[useSseStream] Failed to parse metadata SSE frame:', e);
              }
            } else if (eventType === 'done') {
              dispatch(finishStreaming());
            } else if (eventType === 'error') {
              try {
                const errorData = JSON.parse(dataStr) as SseErrorEventDTO;
                dispatch(setStreamError(errorData.message || 'Stream error'));
              } catch {
                dispatch(setStreamError(dataStr || 'Stream error'));
              }
            }
          }
        }

        // Final safety cleanup if done event was omitted
        dispatch(finishStreaming());
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          dispatch(finishStreaming());
          return;
        }
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Connection interrupted. Your progress on this milestone was preserved.';
        dispatch(setStreamError(errorMsg));
      } finally {
        abortControllerRef.current = null;
      }
    },
    [sessionId, isStreaming, dispatch]
  );

  const retryLastMessage = useCallback(async () => {
    if (lastTurnRef.current) {
      await sendMessage(
        lastTurnRef.current.message,
        lastTurnRef.current.forceDirectExplanation
      );
    }
  }, [sendMessage]);

  return {
    sendMessage,
    retryLastMessage,
    abortStream,
    isStreaming,
    streamBuffer,
    streamError,
    activeTurnMessage: activeTurnMessage ?? null,
  };
};

export default useSseStream;
