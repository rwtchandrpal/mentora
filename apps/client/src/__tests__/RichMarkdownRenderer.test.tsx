// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import mermaid from 'mermaid';
import { RichMarkdownRenderer } from '../components/common/RichMarkdownRenderer.js';
import { CodeBlock } from '../components/common/CodeBlock.js';
import { MermaidDiagram } from '../components/common/MermaidDiagram.js';
import { KaTeXBlock } from '../components/common/KaTeXBlock.js';

// Deterministically mock mermaid since JSDOM does not implement SVG layout primitives like getBBox
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn().mockImplementation(async (code: string) => {
      if (code.includes('INVALID_SYNTAX') || code.includes('BROKEN_DIAGRAM')) {
        throw new Error('Parse error: invalid diagram syntax');
      }
      return {};
    }),
    render: vi.fn().mockImplementation(async (id: string, code: string) => {
      if (code.includes('RENDER_ERROR')) {
        throw new Error('Render error: SVG layout failed');
      }
      return {
        svg: `<svg id="${id}" data-testid="mocked-svg"><text>${code}</text></svg>`,
      };
    }),
  },
}));

describe('IMP-015: Frontend <RichMarkdownRenderer /> & Common Components', () => {
  const originalClipboard = navigator.clipboard;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cleanup();
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  describe('1. GFM Markdown & Tables', () => {
    it('renders standard Markdown headings, lists, blockquotes, and links', () => {
      const markdown = `
# Topic Heading 1
## Subheading 2

This is **bold text** and *italic text*.

- Bullet point 1
- Bullet point 2

1. Numbered item 1
2. Numbered item 2

> This is an important pedagogical tip.

[Mentora Documentation](https://mentora.example.com)
      `;

      const { container } = render(<RichMarkdownRenderer content={markdown} />);

      expect(screen.getByRole('heading', { level: 1, name: 'Topic Heading 1' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Subheading 2' })).toBeInTheDocument();
      expect(screen.getByText('bold text')).toBeInTheDocument();
      expect(screen.getByText('Bullet point 1')).toBeInTheDocument();
      expect(screen.getByText('Numbered item 1')).toBeInTheDocument();
      expect(screen.getByText(/pedagogical tip/)).toBeInTheDocument();

      const link = screen.getByRole('link', { name: 'Mentora Documentation' });
      expect(link).toHaveAttribute('href', 'https://mentora.example.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(container.querySelector('blockquote')).toBeInTheDocument();
    });

    it('renders GitHub Flavored Markdown (GFM) tables properly with accessible wrappers', () => {
      const tableMarkdown = `
| Concept | Description | Time Complexity |
| :--- | :--- | :--- |
| Binary Search | Divide and conquer | $\\mathcal{O}(\\log n)$ |
| Linear Search | Sequential scan | $\\mathcal{O}(n)$ |
      `;

      render(<RichMarkdownRenderer content={tableMarkdown} />);

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('Concept')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Time Complexity')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();
      expect(screen.getByText('Linear Search')).toBeInTheDocument();
    });
  });

  describe('2. KaTeX Mathematical Notation', () => {
    it('renders inline math ($...$) into .katex DOM elements', () => {
      const inlineMath = 'The famous mass-energy equation is $E = mc^2$.';
      const { container } = render(<RichMarkdownRenderer content={inlineMath} />);

      const katexElement = container.querySelector('.katex');
      expect(katexElement).toBeInTheDocument();
      expect(container.textContent).toContain('E=mc2');
    });

    it('renders block display math ($$...$$) into .katex-display DOM elements', () => {
      const displayMath = `
Here is the Gaussian integral:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$
      `;
      const { container } = render(<RichMarkdownRenderer content={displayMath} />);

      const displayElement = container.querySelector('.katex-display');
      expect(displayElement).toBeInTheDocument();
      expect(container.querySelector('.katex')).toBeInTheDocument();
    });

    it('renders standalone <KaTeXBlock /> correctly for both inline and display modes', () => {
      const { container: inlineContainer } = render(
        <KaTeXBlock math="a^2 + b^2 = c^2" displayMode={false} />
      );
      expect(inlineContainer.querySelector('.katex')).toBeInTheDocument();
      expect(screen.getByTestId('katex-inline-block')).toBeInTheDocument();

      const { container: displayContainer } = render(
        <KaTeXBlock math="\\sum_{i=1}^n i = \\frac{n(n+1)}{2}" displayMode={true} />
      );
      expect(displayContainer.querySelector('.katex-display')).toBeInTheDocument();
      expect(screen.getByTestId('katex-display-block')).toBeInTheDocument();
    });
  });

  describe('3. Syntax-Highlighted Code & Copy Button', () => {
    it('renders fenced code blocks with language badge and copy button', async () => {
      const codeSnippet = 'const greet = (name: string): string => `Hello, ${name}`;';
      const markdown = `
\`\`\`typescript
${codeSnippet}
\`\`\`
      `;

      render(<RichMarkdownRenderer content={markdown} />);

      expect(screen.getByText('TYPESCRIPT')).toBeInTheDocument();
      expect(screen.getByTestId('code-block')).toHaveTextContent('const greet');

      const copyButton = screen.getByRole('button', { name: /copy code/i });
      expect(copyButton).toBeInTheDocument();
      expect(copyButton).toHaveTextContent('Copy');

      // Click copy button
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(writeTextMock).toHaveBeenCalledWith(codeSnippet);
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    it('renders standalone <CodeBlock /> with fallback when language is omitted', async () => {
      const rawText = 'plain configuration text without language';
      render(<CodeBlock code={rawText} />);

      expect(screen.getByText('TEXT')).toBeInTheDocument();
      expect(screen.getByTestId('code-block')).toHaveTextContent(rawText);

      const copyBtn = screen.getByRole('button', { name: /copy code/i });
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(writeTextMock).toHaveBeenCalledWith(rawText);
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    it('renders inline code without CodeBlock wrapper bar', () => {
      const markdown = 'Use the `useState` hook for component state.';
      const { container } = render(<RichMarkdownRenderer content={markdown} />);

      expect(screen.queryByTestId('code-block')).not.toBeInTheDocument();
      const inlineCode = container.querySelector('code');
      expect(inlineCode).toBeInTheDocument();
      expect(inlineCode).toHaveTextContent('useState');
    });
  });

  describe('4. Valid Mermaid Diagram Rendering', () => {
    it('renders valid Mermaid code blocks as responsive SVG diagrams', async () => {
      const mermaidCode = 'graph TD\n  A["Start"] --> B["End"]';
      const markdown = `
\`\`\`mermaid
${mermaidCode}
\`\`\`
      `;

      render(<RichMarkdownRenderer content={markdown} />);

      await waitFor(() => {
        expect(mermaid.parse).toHaveBeenCalled();
        expect(mermaid.render).toHaveBeenCalled();
      });

      const diagramContainer = await screen.findByTestId('mermaid-diagram');
      expect(diagramContainer).toBeInTheDocument();
      expect(diagramContainer).toHaveAttribute('role', 'img');
      expect(diagramContainer).toHaveAttribute('aria-label', 'Concept diagram');
      expect(screen.getByTestId('mocked-svg')).toBeInTheDocument();
    });

    it('renders standalone <MermaidDiagram /> successfully', async () => {
      const validCode = 'sequenceDiagram\n  Alice->>Bob: Hello';
      render(<MermaidDiagram code={validCode} />);

      await waitFor(() => {
        expect(mermaid.render).toHaveBeenCalled();
      });

      expect(await screen.findByTestId('mermaid-diagram')).toBeInTheDocument();
    });
  });

  describe('5. Malformed Mermaid Diagram Fallback (Edge Case 3)', () => {
    it('gracefully catches parse syntax errors and displays the preformatted fallback container without crashing', async () => {
      const brokenMermaid = `
\`\`\`mermaid
INVALID_SYNTAX malformed diagram without closing quotes
\`\`\`
      `;

      render(<RichMarkdownRenderer content={brokenMermaid} />);

      await waitFor(() => {
        expect(mermaid.parse).toHaveBeenCalled();
      });

      const fallback = await screen.findByTestId('mermaid-fallback');
      expect(fallback).toBeInTheDocument();
      expect(
        screen.getByText('Diagram preview unavailable — showing raw structure')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/INVALID_SYNTAX malformed diagram/)
      ).toBeInTheDocument();

      // Ensure valid diagram container is not rendered
      expect(screen.queryByTestId('mermaid-diagram')).not.toBeInTheDocument();
    });

    it('gracefully catches render failure and displays the fallback container', async () => {
      const renderErrorCode = 'flowchart TD\n  A --> RENDER_ERROR';
      render(<MermaidDiagram code={renderErrorCode} />);

      await waitFor(() => {
        expect(mermaid.render).toHaveBeenCalled();
      });

      const fallback = await screen.findByTestId('mermaid-fallback');
      expect(fallback).toBeInTheDocument();
      expect(screen.getByText(/RENDER_ERROR/)).toBeInTheDocument();
    });

    it('displays fallback immediately when mermaid code is empty or whitespace', async () => {
      render(<MermaidDiagram code="   " />);

      const fallback = await screen.findByTestId('mermaid-fallback');
      expect(fallback).toBeInTheDocument();
    });
  });
});
