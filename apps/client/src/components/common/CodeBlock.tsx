import React, { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface CodeBlockProps {
  language?: string;
  code: string;
  className?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  language,
  code,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const normalizedLanguage = (language || 'text')
    .toLowerCase()
    .replace(/^language-/, '')
    .trim();

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback or ignore clipboard denial without throwing
    }
  }, [code]);

  return (
    <div
      className={`my-4 rounded-lg border border-slate-700 bg-slate-900 overflow-hidden shadow-sm ${className}`}
      data-testid="code-block"
    >
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-800/80 border-b border-slate-700 text-xs text-slate-300">
        <span className="font-mono font-semibold uppercase tracking-wider text-slate-400">
          {normalizedLanguage.toUpperCase()}
        </span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-slate-900"
        >
          {copied ? (
            <span className="text-emerald-400 font-medium">Copied!</span>
          ) : (
            <span>Copy</span>
          )}
        </button>
      </div>

      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={normalizedLanguage === 'text' ? undefined : normalizedLanguage}
          style={oneDark}
          customStyle={{
            margin: 0,
            padding: '1rem',
            backgroundColor: '#0f172a',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }}
          codeTagProps={{
            style: {
              fontFamily: 'inherit',
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};
