// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChatRole, type InteractMessageDTO } from '@mentora/shared';
import { ChatTranscript } from '../components/interact/ChatTranscript.js';

afterEach(() => cleanup());

/**
 * LIVE-FIX-007 (BUG-M3): a chat bubble is a `flex-1` child of a flex row.
 * Without `min-w-0` its min-content width is the widest table, so on a 390px
 * screen the bubble grew to 505px and was clipped instead of letting the
 * table scroll inside `.rich-table-container`. jsdom has no layout, so this
 * pins the classes that make the bubble shrinkable; the 390px behaviour was
 * checked in a real browser (see the audit report).
 */
const TABLE = [
  'Here is the comparison:',
  '',
  '| Structure | Insert | Extract-min | Decrease-key | Dijkstra total |',
  '|---|---|---|---|---|',
  '| Binary heap | O(log V) | O(log V) | O(log V) | O((V + E) log V) |',
  '| Fibonacci heap | O(1) | O(log V) amortised | O(1) amortised | O(E + V log V) |',
].join('\n');

const message = (id: string, role: ChatRole, content: string): InteractMessageDTO => ({
  id,
  role,
  content,
  milestoneNumber: 2,
  strikeNumberAtTurn: 0,
  isCircuitBreakerExplanation: role === ChatRole.ASSISTANT,
  createdAt: '2026-11-22T10:42:00.000Z',
});

describe('LIVE-FIX-007: chat bubbles can shrink below their content width', () => {
  it('gives every bubble min-w-0 (saved user + assistant, in-flight user, streaming)', () => {
    render(
      <ChatTranscript
        messages={[
          message('u1', ChatRole.USER, TABLE),
          message('a1', ChatRole.ASSISTANT, TABLE),
        ]}
        isStreaming
        streamBuffer={TABLE}
        streamError={null}
        activeTurnMessage={TABLE}
      />
    );

    const bubbles = screen.getAllByTestId('chat-bubble');
    expect(bubbles).toHaveLength(4);
    for (const bubble of bubbles) {
      expect(bubble).toHaveClass('flex-1', 'min-w-0', 'break-words');
      // The bubble's flex parent is the row that used to be widened.
      expect(bubble.parentElement).toHaveClass('flex');
    }
  });

  it('keeps the table inside its horizontal scroll container in every bubble', () => {
    render(
      <ChatTranscript
        messages={[message('a1', ChatRole.ASSISTANT, TABLE)]}
        isStreaming
        streamBuffer={TABLE}
        streamError={null}
        activeTurnMessage={null}
      />
    );

    const bubbles = screen.getAllByTestId('chat-bubble');
    expect(bubbles).toHaveLength(2);
    for (const bubble of bubbles) {
      const table = bubble.querySelector('table');
      expect(table).not.toBeNull();
      expect(table!.closest('.rich-table-container')).toHaveClass('overflow-x-auto');
    }
  });
});
