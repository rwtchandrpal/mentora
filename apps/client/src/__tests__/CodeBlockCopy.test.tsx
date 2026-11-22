// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CodeBlock } from '../components/common/CodeBlock.js';

const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, 'clipboard', { value, writable: true, configurable: true });

const setExec = (fn: unknown) =>
  Object.defineProperty(document, 'execCommand', { value: fn, writable: true, configurable: true });

const clickCopy = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }));
  });
};

describe('LIVE-FIX-009: CodeBlock copy fallback & feedback', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setClipboard(undefined);
    setExec(undefined);
  });

  it('shows Copied! when the Clipboard API succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CodeBlock language="js" code="x = 1" />);
    await clickCopy();
    expect(writeText).toHaveBeenCalledWith('x = 1');
    expect(screen.getByRole('button', { name: /copy code/i })).toHaveTextContent('Copied!');
  });

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
    const exec = vi.fn().mockReturnValue(true);
    setExec(exec);
    render(<CodeBlock language="js" code="x = 1" />);
    await clickCopy();
    expect(exec).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button', { name: /copy code/i })).toHaveTextContent('Copied!');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back to execCommand when the Clipboard API is missing', async () => {
    setClipboard(undefined);
    const exec = vi.fn().mockReturnValue(true);
    setExec(exec);
    render(<CodeBlock language="js" code="x = 1" />);
    await clickCopy();
    expect(exec).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button', { name: /copy code/i })).toHaveTextContent('Copied!');
  });

  it('shows "Copy failed" (announced politely) when both paths fail, then resets', async () => {
    vi.useFakeTimers();
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
    setExec(vi.fn().mockReturnValue(false));
    render(<CodeBlock language="js" code="x = 1" />);
    await clickCopy();
    const button = screen.getByRole('button', { name: /copy code/i });
    expect(button).toHaveTextContent('Copy failed');
    expect(screen.getByRole('status')).toHaveTextContent('Copy failed');
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(button).toHaveTextContent(/^Copy$/);
  });
});
