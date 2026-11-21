import { useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks.js';
import {
  startStreaming,
  setActiveTurnId,
  appendStreamToken,
  setStreamError,
  finishStreaming,
  applyInteractMetadata,
} from '../store/sessionSlice.js';
import { setQuota } from '../store/authSlice.js';
import { buildAuthHeaders, notifyUnauthorized } from '../services/apiClient.js';
import { env } from '../config/env.js';
import type {
  SseStartEventDTO,
  SseTokenEventDTO,
  SseMetadataEventDTO,
  SseErrorEventDTO,
} from '@mentora/shared';

export const CONNECTION_INTERRUPTED_MESSAGE =
  'Connection interrupted. Your progress on this milestone was preserved.';

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

      const url = `${env.VITE_API_BASE_URL}/sessions/${sessionId}/interact/stream`;

      try {
        const authHeaders = buildAuthHeaders(`/sessions/${sessionId}/interact/stream`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            message: effectiveMessage,
            forceDirectExplanation,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          // Same rule as the axios interceptor: a rejected bearer token means the
          // session expired, so log out instead of leaving a dead session (A-09).
          if (response.status === 401 && 'Authorization' in authHeaders) {
            notifyUnauthorized();
          }
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
          dispatch(finishStreaming());
          return;
        }

        if (!response.body) {
          dispatch(setStreamError('No response body received from server'));
          dispatch(finishStreaming());
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        // Set once the turn ends cleanly (`done`) or the server reported a failure (`error`).
        let receivedDone = false;
        let receivedError = false;

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
                // Only record the turn ID: re-running startStreaming here would wipe the
                // learner's in-flight message while the reply streams.
                dispatch(setActiveTurnId(startData.turnId));
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
              receivedDone = true;
              dispatch(finishStreaming());
            } else if (eventType === 'error') {
              receivedError = true;
              try {
                const errorData = JSON.parse(dataStr) as SseErrorEventDTO;
                dispatch(setStreamError(errorData.message || 'Stream error'));
              } catch {
                dispatch(setStreamError(dataStr || 'Stream error'));
              }
            }
          }
        }

        if (receivedError) {
          // Keep the learner's message on screen next to the Retry control (Edge Case 4).
          return;
        }
        if (!receivedDone) {
          // The stream closed without `done` or `error` (e.g. the server dropped the
          // connection mid-reply). Nothing was persisted, so offer a retry.
          dispatch(setStreamError(CONNECTION_INTERRUPTED_MESSAGE));
          return;
        }
        dispatch(finishStreaming());
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          dispatch(finishStreaming());
          return;
        }
        // Transport failures surface as raw browser text ("Failed to fetch", "network
        // error"); show one friendly, retryable message instead (L-11).
        dispatch(setStreamError(CONNECTION_INTERRUPTED_MESSAGE));
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
