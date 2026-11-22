import React, { useState, useCallback, useRef, useEffect } from 'react';
// PrismAsyncLight loads each language grammar on demand instead of bundling every
// Prism language into the entry chunk (A-16). Code shows unhighlighted until it loads.
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface CodeBlockProps {
  language?: string;
  code: string;
  className?: string;
}

/** Fallback for when the async Clipboard API is unavailable or rejects. */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  const previouslyFocused = document.activeElement as HTMLElement | null;
  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
    previouslyFocused?.focus?.();
  }
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  language,
  code,
  className = '',
}) => {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const normalizedLanguage = (language || 'text')
    .toLowerCase()
    .replace(/^language-/, '')
    .trim();

  const handleCopy = useCallback(async () => {
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        ok = true;
      }
    } catch {
      // Clipboard API denied (permissions, insecure context, iframe): try the legacy path.
    }
    if (!ok) ok = legacyCopy(code);
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus(ok ? 'copied' : 'failed');
    timerRef.current = setTimeout(() => setStatus('idle'), 2000);
  }, [code]);

  return (
    <div
      className={`my-4 rounded-lg border border-slate-700 bg-slate-900 overflow-hidden shadow-sm ${className}`}
      data-testid="code-block"
    >
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-800/80 border-b border-slate-700 text-xs text-slate-200">
        <span className="font-mono font-semibold uppercase tracking-wider text-slate-300">
          {normalizedLanguage.toUpperCase()}
        </span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-slate-900"
        >
          {status === 'copied' ? (
            <span className="text-emerald-400 font-medium">Copied!</span>
          ) : status === 'failed' ? (
            <span className="text-amber-400 font-medium">Copy failed</span>
          ) : (
            <span>Copy</span>
          )}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {status === 'copied' ? 'Code copied to clipboard' : status === 'failed' ? 'Copy failed' : ''}
        </span>
      </div>

      <div className="overflow-x-auto">
        <SyntaxHighlighter
          // The async highlighter needs a string; unknown languages (incl. 'text') render plain.
          language={normalizedLanguage || 'text'}
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
