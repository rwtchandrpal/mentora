// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import '@testing-library/jest-dom/vitest';
import { createAppStore } from '../store/index.js';
import { openProfileModal } from '../store/uiSlice.js';
import { McqQuestionCard } from '../components/practice/McqQuestionCard.js';
import { ProfileSettingsModal } from '../components/layout/ProfileSettingsModal.js';

const question = {
  questionNumber: 1,
  questionText: 'Pick one',
  options: ['a', 'b', 'c', 'd'],
  hint: null,
} as never;

const Harness: React.FC<{ initial?: number | null; disabled?: boolean }> = ({
  initial = null,
  disabled = false,
}) => {
  const [sel, setSel] = useState<number | null>(initial);
  return (
    <McqQuestionCard
      question={question}
      selectedOptionIndex={sel}
      onSelectOption={setSel}
      disabled={disabled}
    />
  );
};

const opt = (i: number) => screen.getByTestId(`mcq-option-1-${i}`);

describe('LIVE-FIX-012: keyboard & focus accessibility', () => {
  afterEach(cleanup);

  describe('MCQ radiogroup', () => {
    it('exposes exactly one Tab stop: the first option when none is selected', () => {
      render(<Harness />);
      expect([0, 1, 2, 3].map((i) => opt(i).tabIndex)).toEqual([0, -1, -1, -1]);
    });

    it('moves the single Tab stop to the selected option', () => {
      render(<Harness initial={2} />);
      expect([0, 1, 2, 3].map((i) => opt(i).tabIndex)).toEqual([-1, -1, 0, -1]);
    });

    it('arrow keys move focus and selection, wrapping at the ends', () => {
      render(<Harness />);
      opt(0).focus();
      fireEvent.keyDown(opt(0), { key: 'ArrowDown' });
      expect(opt(1)).toHaveAttribute('aria-checked', 'true');
      expect(document.activeElement).toBe(opt(1));
      fireEvent.keyDown(opt(1), { key: 'ArrowRight' });
      expect(document.activeElement).toBe(opt(2));
      fireEvent.keyDown(opt(2), { key: 'ArrowUp' });
      expect(document.activeElement).toBe(opt(1));
      fireEvent.keyDown(opt(1), { key: 'ArrowLeft' });
      fireEvent.keyDown(opt(0), { key: 'ArrowUp' });
      expect(opt(3)).toHaveAttribute('aria-checked', 'true');
      expect(document.activeElement).toBe(opt(3));
      expect(opt(3).tabIndex).toBe(0);
    });

    it('Space and Enter still select', () => {
      render(<Harness />);
      fireEvent.keyDown(opt(2), { key: ' ' });
      expect(opt(2)).toHaveAttribute('aria-checked', 'true');
      fireEvent.keyDown(opt(3), { key: 'Enter' });
      expect(opt(3)).toHaveAttribute('aria-checked', 'true');
    });

    it('is not tabbable and ignores arrows when disabled', () => {
      render(<Harness disabled />);
      expect([0, 1, 2, 3].map((i) => opt(i).tabIndex)).toEqual([-1, -1, -1, -1]);
      fireEvent.keyDown(opt(0), { key: 'ArrowDown' });
      expect(opt(1)).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('Profile settings modal', () => {
    const renderModal = () => {
      const store = createAppStore();
      render(
        <Provider store={store}>
          <button type="button">Open profile</button>
          <ProfileSettingsModal />
        </Provider>
      );
      return store;
    };

    it('moves focus into the dialog, traps Tab, and restores focus on close', () => {
      const store = renderModal();
      const trigger = screen.getByRole('button', { name: 'Open profile' });
      trigger.focus();
      act(() => {
        store.dispatch(openProfileModal());
      });

      const dialog = screen.getByRole('dialog');
      expect(document.activeElement).toBe(screen.getByLabelText(/education/i));
      expect(dialog.contains(document.activeElement)).toBe(true);

      const close = screen.getByRole('button', { name: 'Close modal' });
      const save = screen.getByRole('button', { name: /save settings/i });

      save.focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(document.activeElement).toBe(close);

      close.focus();
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(save);

      trigger.focus(); // focus that escaped the dialog is pulled back in
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(dialog.contains(document.activeElement)).toBe(true);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });
});
