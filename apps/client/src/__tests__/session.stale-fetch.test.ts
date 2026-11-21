import { describe, it, expect } from 'vitest';
import sessionReducer, {
  fetchSessionByIdThunk,
  clearActiveSession,
  initialSessionState,
} from '../store/sessionSlice.js';
import type { TopicSessionDTO } from '@mentora/shared';

const fakeSession = { id: 's1', lastActiveMode: 'explain' } as unknown as TopicSessionDTO;
const fulfilled = (requestId: string) =>
  fetchSessionByIdThunk.fulfilled({ success: true, data: fakeSession }, requestId, 's1');

describe('session by-id fetch race', () => {
  it('ignores a fetch that resolves after the active session was cleared', () => {
    let state = sessionReducer(initialSessionState, fetchSessionByIdThunk.pending('req-1', 's1'));
    state = sessionReducer(state, clearActiveSession());
    state = sessionReducer(state, fulfilled('req-1'));
    expect(state.activeSession).toBeNull();
    expect(state.isLoadingSession).toBe(false);
  });

  it('ignores an older fetch superseded by a newer one', () => {
    let state = sessionReducer(initialSessionState, fetchSessionByIdThunk.pending('req-1', 's1'));
    state = sessionReducer(state, fetchSessionByIdThunk.pending('req-2', 's1'));
    state = sessionReducer(state, fulfilled('req-1'));
    expect(state.activeSession).toBeNull();
    state = sessionReducer(state, fulfilled('req-2'));
    expect(state.activeSession?.id).toBe('s1');
  });
});
