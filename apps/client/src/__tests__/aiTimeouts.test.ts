// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { LearningMode, PracticeTier } from '@mentora/shared';
import { apiClient } from '../services/apiClient.js';
import { createAppStore } from '../store/index.js';
import {
  createSessionThunk,
  initializeExplainThunk,
  generateDeepDiveThunk,
  initializeInteractThunk,
  generatePracticeBatchThunk,
} from '../store/sessionSlice.js';
import { AI_FAST_TIMEOUT_MS, AI_REASONING_TIMEOUT_MS } from '../config/timeouts.js';

const DEFAULT_CLIENT_TIMEOUT_MS = 15_000;

describe('T2.1: AI thunks use shared timeout constants', () => {
  const originalAdapter = apiClient.defaults.adapter;
  const captured: Array<{ url?: string; timeout?: number }> = [];

  const captureAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    captured.push({ url: config.url, timeout: config.timeout });
    return {
      data: { success: true, data: { id: 's1', _id: 's1', lastActiveMode: LearningMode.EXPLAIN } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    captured.length = 0;
  });

  it('server worst case (2 attempts + back-off) fits inside the constants', () => {
    expect(AI_FAST_TIMEOUT_MS).toBeGreaterThan(DEFAULT_CLIENT_TIMEOUT_MS);
    expect(AI_REASONING_TIMEOUT_MS).toBeGreaterThan(AI_FAST_TIMEOUT_MS);
  });

  it.each([
    [LearningMode.EXPLAIN, AI_FAST_TIMEOUT_MS],
    [LearningMode.INTERACT, AI_FAST_TIMEOUT_MS],
    [LearningMode.PRACTICE, AI_REASONING_TIMEOUT_MS],
  ])('createSessionThunk with initialMode=%s uses %d ms', async (initialMode, expected) => {
    apiClient.defaults.adapter = captureAdapter;
    const store = createAppStore();
    await store.dispatch(createSessionThunk({ topicQuery: 'Graphs', initialMode }));
    expect(captured[0]?.timeout).toBe(expected);
  });

  it('mode thunks use fast or reasoning timeouts', async () => {
    apiClient.defaults.adapter = captureAdapter;
    const store = createAppStore();
    await store.dispatch(initializeExplainThunk('s1'));
    await store.dispatch(generateDeepDiveThunk({ sessionId: 's1', stepNumber: 1 }));
    await store.dispatch(initializeInteractThunk('s1'));
    await store.dispatch(generatePracticeBatchThunk({ sessionId: 's1', tier: PracticeTier.EASY }));

    expect(captured.map((c) => c.timeout)).toEqual([
      AI_FAST_TIMEOUT_MS,
      AI_REASONING_TIMEOUT_MS,
      AI_FAST_TIMEOUT_MS,
      AI_REASONING_TIMEOUT_MS,
    ]);
  });
});
