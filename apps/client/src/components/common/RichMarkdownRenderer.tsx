import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { CodeBlock } from './CodeBlock.js';
import { MermaidDiagram } from './MermaidDiagram.js';

export interface RichMarkdownRendererProps {
  content: string;
  className?: string;
}

const markdownComponents: Components = {
  pre({ children }) {
    // Un-wrap <pre> so CodeBlock and MermaidDiagram manage their own styled containers
    return <>{children}</>;
  },
  code({ className, children, ...rest }) {
    const codeString = String(children ?? '').replace(/\n$/, '');
    const isMermaid = /language-mermaid/.test(className || '');
    const languageMatch = /language-([a-zA-Z0-9_-]+)/.exec(className || '');
    const isMultiline = String(children ?? '').includes('\n');

    if (isMermaid) {
      return <MermaidDiagram code={codeString} />;
    }

    if (languageMatch || isMultiline) {
      return (
        <CodeBlock
          language={languageMatch ? languageMatch[1] : undefined}
          code={codeString}
        />
      );
    }

    return (
      <code
        className="px-1.5 py-0.5 rounded font-mono text-sm border rich-code"
        {...rest}
      >
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto rounded-lg border shadow-xs rich-table-container">
        <table className="min-w-full divide-y text-left text-sm rich-table">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="text-xs font-semibold uppercase tracking-wider rich-thead">
        {children}
      </thead>
    );
  },
  tbody({ children }) {
    return <tbody className="divide-y rich-tbody">{children}</tbody>;
  },
  tr({ children }) {
    return <tr className="transition-colors rich-tr">{children}</tr>;
  },
  th({ children }) {
    return <th className="px-4 py-3 font-semibold rich-th">{children}</th>;
  },
  td({ children }) {
    return <td className="px-4 py-3 rich-td">{children}</td>;
  },
  h1({ children }) {
    return (
      <h1 className="text-2xl font-bold tracking-tight mt-6 mb-3 first:mt-0 rich-h1">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="text-xl font-semibold tracking-tight mt-5 mb-2.5 first:mt-0 rich-h2">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="text-lg font-semibold mt-4 mb-2 first:mt-0 rich-h3">
        {children}
      </h3>
    );
  },
  h4({ children }) {
    return (
      <h4 className="text-base font-semibold mt-3 mb-1.5 first:mt-0 rich-h4">
        {children}
      </h4>
    );
  },
  p({ children }) {
    return (
      <p className="leading-relaxed my-2.5 first:mt-0 last:mb-0 rich-p">
        {children}
      </p>
    );
  },
  ul({ children }) {
    return (
      <ul className="my-3 list-disc list-outside pl-6 space-y-1.5 rich-ul">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="my-3 list-decimal list-outside pl-6 space-y-1.5 rich-ol">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="leading-relaxed rich-li">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-4 border-l-4 pl-4 py-2 italic rounded-r rich-blockquote">
        {children}
      </blockquote>
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded rich-link font-medium"
      >
        {children}
      </a>
    );
  },
  hr() {
    return <hr className="my-6 rich-hr" />;
  },
};

export const RichMarkdownRenderer: React.FC<RichMarkdownRendererProps> = memo(
  ({ content, className = '' }) => {
    return (
      <div
        className={`rich-markdown-renderer text-sm leading-relaxed ${className}`}
        data-testid="rich-markdown-renderer"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }
);

RichMarkdownRenderer.displayName = 'RichMarkdownRenderer';
