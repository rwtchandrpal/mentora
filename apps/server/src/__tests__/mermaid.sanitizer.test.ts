import { describe, it, expect } from 'vitest';
import {
  isStructurallyCompleteMermaid,
  stripInvalidMermaid,
} from '../utils/mermaid.sanitizer.js';

describe('mermaid sanitizer', () => {
  it('accepts a complete flowchart', () => {
    expect(
      isStructurallyCompleteMermaid('graph TD\n  A[Start] --> B{Done?}\n  B -->|yes| C(End)')
    ).toBe(true);
  });

  it('rejects a header-only diagram', () => {
    expect(isStructurallyCompleteMermaid('graph TD')).toBe(false);
  });

  it('rejects the truncated diagram seen in production', () => {
    expect(isStructurallyCompleteMermaid('graph TD\n    A[')).toBe(false);
  });

  it('rejects unbalanced quotes and trailing connectors', () => {
    expect(isStructurallyCompleteMermaid('graph TD\n  A["Start --> B')).toBe(false);
    expect(isStructurallyCompleteMermaid('graph TD\n  A[Start] -->')).toBe(false);
  });

  it('accepts asymmetric nodes and brackets inside edge labels (L-08)', () => {
    expect(isStructurallyCompleteMermaid('graph TD\n  A>Flag] --> B[Next]')).toBe(true);
    expect(isStructurallyCompleteMermaid('graph LR\n  start --> note>Remember this]')).toBe(true);
    expect(isStructurallyCompleteMermaid('graph TD\n  A -->|f(x) > 0]| B')).toBe(true);
    // Sequence-diagram arrows are not mistaken for asymmetric nodes.
    expect(
      isStructurallyCompleteMermaid('sequenceDiagram\n  Alice->>Bob: Hello [world]')
    ).toBe(true);
  });

  it('still rejects truncated nodes and edge labels', () => {
    expect(isStructurallyCompleteMermaid('graph TD\n  A --> B[Unclosed')).toBe(false);
    expect(isStructurallyCompleteMermaid('graph TD\n  A --> B>Unclosed [x')).toBe(false);
    expect(isStructurallyCompleteMermaid('graph TD\n  A -->|half a label')).toBe(false);
  });

  it('keeps valid blocks and surrounding text, and drops invalid ones', () => {
    const md = [
      'Intro text.',
      '',
      '```mermaid',
      'graph TD',
      '  A[One] --> B[Two]',
      '```',
      '',
      'Middle.',
      '',
      '```mermaid',
      'graph TD',
      '    A[',
      '```',
      '',
      'Outro.',
    ].join('\n');
    const out = stripInvalidMermaid(md);
    expect(out).toContain('A[One] --> B[Two]');
    expect(out).not.toContain('A[\n');
    expect(out).toContain('Intro text.');
    expect(out).toContain('Middle.');
    expect(out).toContain('Outro.');
  });

  it('drops an unterminated trailing block and leaves other code fences alone', () => {
    const out = stripInvalidMermaid('Text\n\n```python\nx = [1,\n```\n\n```mermaid\ngraph TD\n  A[');
    expect(out).toContain('```python');
    expect(out).not.toContain('mermaid');
  });
});
