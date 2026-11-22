// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MilestoneStatus, type InteractMilestoneDTO } from '@mentora/shared';
import {
  InlineMathText,
  mathTextToPlain,
  splitMathSegments,
} from '../components/common/InlineMathText.js';
import { MilestoneTrackerBar } from '../components/interact/MilestoneTrackerBar.js';

afterEach(() => cleanup());

describe('LIVE-FIX-006: inline math in milestone text', () => {
  describe('splitMathSegments', () => {
    it('splits inline and double-dollar math from surrounding text', () => {
      expect(splitMathSegments('vertices $V$ and $$E$$.')).toEqual([
        { kind: 'text', value: 'vertices ' },
        { kind: 'math', value: 'V', raw: '$V$' },
        { kind: 'text', value: ' and ' },
        { kind: 'math', value: 'E', raw: '$$E$$' },
        { kind: 'text', value: '.' },
      ]);
    });

    it('leaves currency and escaped dollars as text', () => {
      for (const input of ['costs $5 and $10', 'from $5-$10', 'a lone $ sign', 'escaped \\$x\\$']) {
        const segments = splitMathSegments(input);
        expect(segments.every((s) => s.kind === 'text')).toBe(true);
      }
      expect(splitMathSegments('escaped \\$x\\$')).toEqual([
        { kind: 'text', value: 'escaped $x$' },
      ]);
    });

    it('returns plain text unchanged', () => {
      expect(splitMathSegments('Tree Invariant')).toEqual([
        { kind: 'text', value: 'Tree Invariant' },
      ]);
    });
  });

  describe('<InlineMathText />', () => {
    it('typesets math with KaTeX and shows no LaTeX source', () => {
      const { container } = render(
        <p>
          <InlineMathText text="weights $w: E \to \mathbb{R}_{0}^{+}$ in $\mathcal{O}(h)$ time" />
        </p>
      );
      expect(screen.getAllByTestId('inline-math')).toHaveLength(2);
      expect(container.querySelectorAll('.katex')).toHaveLength(2);
      expect(container.querySelector('.katex-error')).toBeNull();
      // Only the visible KaTeX HTML counts; the MathML <annotation> keeps the
      // source for assistive tech by design.
      const visible = Array.from(container.querySelectorAll('.katex-html'))
        .map((el) => el.textContent)
        .join(' ');
      expect(visible).not.toMatch(/[$\\]/);
      expect(container.textContent).toContain('weights ');
      expect(container.textContent).toContain(' time');
    });

    it('emits no block elements, so it can live inside headings and paragraphs', () => {
      const { container } = render(
        <h3>
          <InlineMathText text="Bound $\mathcal{O}(h)$" />
        </h3>
      );
      expect(container.querySelector('h3 div, h3 p')).toBeNull();
    });

    it('falls back to the source for TeX that does not parse', () => {
      const { container } = render(<InlineMathText text="bad $\frac{1$ here" />);
      expect(screen.queryByTestId('inline-math')).toBeNull();
      expect(container.textContent).toBe('bad $\\frac{1$ here');
    });

    it('does not interpret Markdown or HTML in the surrounding text', () => {
      const { container } = render(
        <InlineMathText text="**bold** <img src=x onerror=alert(1)>" />
      );
      expect(container.querySelector('strong, img')).toBeNull();
      expect(container.textContent).toBe('**bold** <img src=x onerror=alert(1)>');
    });
  });

  describe('mathTextToPlain', () => {
    it('replaces math spans with readable text for tooltips', () => {
      const plain = mathTextToPlain('bounds complexity to $\\mathcal{O}(h)$');
      expect(plain).toBe('bounds complexity to O(h)');
      expect(mathTextToPlain('edges $w: E \\to \\mathbb{R}$')).not.toMatch(/[$\\]/);
      expect(mathTextToPlain('Plain title')).toBe('Plain title');
    });
  });

  describe('<MilestoneTrackerBar />', () => {
    const milestones: InteractMilestoneDTO[] = [
      {
        milestoneNumber: 1,
        title: 'Graph model $G = (V, E)$',
        description:
          'Represent the network using vertices $V$ and edges $E$, with strict non-negative edge weight functions $w: E \\to \\mathbb{R}_{0}^{+}$.',
        status: MilestoneStatus.ACTIVE,
      },
      {
        milestoneNumber: 2,
        title: 'Search cost',
        description: 'Height bounds operational complexity to $\\mathcal{O}(h)$.',
        status: MilestoneStatus.PENDING,
      },
    ];

    it('renders milestone math instead of raw LaTeX (live Dijkstra/BST strings)', () => {
      render(
        <MilestoneTrackerBar milestones={milestones} activeMilestoneIndex={0} strikeCount={0} />
      );
      const tracker = screen.getByTestId('milestone-tracker');
      expect(tracker.querySelectorAll('.katex').length).toBe(5);
      expect(tracker.querySelector('.katex-error')).toBeNull();

      // What a sighted user sees: the tracker without MathML copies.
      const clone = tracker.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.katex-mathml').forEach((n) => n.remove());
      expect(clone.textContent).not.toMatch(/[$\\]/);

      // Tooltips are plain text too.
      for (const el of within(tracker).getAllByTitle(/.+/)) {
        expect(el.getAttribute('title')).not.toMatch(/[$\\]/);
      }
      expect(screen.getByTitle('Search cost')).toBeInTheDocument();
    });
  });
});
