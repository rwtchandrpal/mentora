// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { PracticeTier, type ApiSuccessEnvelope } from '@mentora/shared';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '../services/apiClient.js';
import { createAppStore } from '../store/index.js';
import { logout } from '../store/authSlice.js';
import { deleteSessionThunk } from '../store/sessionSlice.js';
import { clearQuizDrafts, getQuizDraftStorageKey } from '../utils/quizDraftStorage.js';

const seedDrafts = () => {
  window.localStorage.setItem(getQuizDraftStorageKey('session-a', PracticeTier.EASY), '{}');
  window.localStorage.setItem(getQuizDraftStorageKey('session-a', PracticeTier.MEDIUM), '{}');
  window.localStorage.setItem(getQuizDraftStorageKey('session-b', PracticeTier.EASY), '{}');
  window.localStorage.setItem('mentora_auth_token', 'token');
};

const draftKeys = () =>
  Object.keys(window.localStorage).filter((key) => key.startsWith('mentora_quiz_draft_'));

describe('L-12: quiz draft cleanup', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedDrafts();
  });

  it('clearQuizDrafts(sessionId) removes only that session’s drafts', () => {
    clearQuizDrafts('session-a');
    expect(draftKeys()).toEqual([getQuizDraftStorageKey('session-b', PracticeTier.EASY)]);
    expect(window.localStorage.getItem('mentora_auth_token')).toBe('token');
  });

  it('logout removes every quiz draft', () => {
    const store = createAppStore();
    store.dispatch(logout());
    expect(draftKeys()).toEqual([]);
  });

  it('deleting a session removes its drafts', async () => {
    const originalAdapter = apiClient.defaults.adapter;
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => ({
      data: { success: true, data: { deletedId: 'session-a' } } as ApiSuccessEnvelope<{
        deletedId: string;
      }>,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
    apiClient.defaults.adapter = adapter;
    try {
      const store = createAppStore();
      await store.dispatch(deleteSessionThunk('session-a'));
      expect(draftKeys()).toEqual([getQuizDraftStorageKey('session-b', PracticeTier.EASY)]);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });
});
