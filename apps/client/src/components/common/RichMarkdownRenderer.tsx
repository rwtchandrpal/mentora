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
        className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-sm border border-slate-700/60"
        {...rest}
      >
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto rounded-lg border border-slate-700 shadow-sm">
        <table className="min-w-full divide-y divide-slate-700 bg-slate-900/80 text-left text-sm text-slate-200">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-slate-800/90 text-xs font-semibold uppercase tracking-wider text-slate-300">{children}</thead>;
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-slate-800">{children}</tbody>;
  },
  tr({ children }) {
    return <tr className="hover:bg-slate-800/40 transition-colors">{children}</tr>;
  },
  th({ children }) {
    return <th className="px-4 py-3 font-semibold">{children}</th>;
  },
  td({ children }) {
    return <td className="px-4 py-3 text-slate-300">{children}</td>;
  },
  h1({ children }) {
    return <h1 className="text-2xl font-bold tracking-tight text-slate-100 mt-6 mb-3 first:mt-0">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-xl font-semibold tracking-tight text-slate-100 mt-5 mb-2.5 first:mt-0">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-lg font-semibold text-slate-200 mt-4 mb-2 first:mt-0">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="text-base font-semibold text-slate-200 mt-3 mb-1.5 first:mt-0">{children}</h4>;
  },
  p({ children }) {
    return <p className="leading-relaxed text-slate-300 my-2.5 first:mt-0 last:mb-0">{children}</p>;
  },
  ul({ children }) {
    return <ul className="my-3 list-disc list-outside pl-6 space-y-1.5 text-slate-300">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-3 list-decimal list-outside pl-6 space-y-1.5 text-slate-300">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-4 border-l-4 border-indigo-500 bg-slate-800/40 pl-4 py-2 italic text-slate-300 rounded-r">
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
        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
      >
        {children}
      </a>
    );
  },
  hr() {
    return <hr className="my-6 border-slate-700" />;
  },
};

export const RichMarkdownRenderer: React.FC<RichMarkdownRendererProps> = memo(
  ({ content, className = '' }) => {
    return (
      <div
        className={`rich-markdown-renderer text-slate-200 text-sm leading-relaxed ${className}`}
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

