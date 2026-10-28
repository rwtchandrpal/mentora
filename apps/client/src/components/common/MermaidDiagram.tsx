import React, { useEffect, useState, useId } from 'react';
import mermaid from 'mermaid';

let isMermaidInitialized = false;

const initializeMermaidOnce = (): void => {
  if (!isMermaidInitialized) {
    try {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      });
      isMermaidInitialized = true;
    } catch {
      // Ignore re-initialization warnings in tests
    }
  }
};

export interface MermaidDiagramProps {
  code: string;
  className?: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  code,
  className = '',
}) => {
  const reactId = useId();
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    initializeMermaidOnce();

    const renderDiagram = async (): Promise<void> => {
      try {
        setIsLoading(true);
        setHasError(false);

        // Edge Case 3: Validate diagram syntax prior to full render
        await mermaid.parse(trimmedCode);

        const uniqueContainerId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}-${Math.random().toString(36).substring(2, 7)}`;
        const { svg } = await mermaid.render(uniqueContainerId, trimmedCode);

        if (!isCancelled) {
          setSvgHtml(svg);
          setHasError(false);
          setIsLoading(false);
        }
      } catch {
        // Edge Case 3 & AGENTS.md Section E: Catch syntax/layout errors gracefully without crashing
        if (!isCancelled) {
          setHasError(true);
          setSvgHtml(null);
          setIsLoading(false);
        }
      }
    };

    void renderDiagram();

    return () => {
      isCancelled = true;
    };
  }, [code, reactId]);

  if (hasError) {
    return (
      <div
        className={`my-4 p-4 rounded-lg border border-amber-500/30 bg-amber-950/20 text-amber-200 ${className}`}
        data-testid="mermaid-fallback"
      >
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-amber-400">
          <span>Diagram preview unavailable — showing raw structure</span>
        </div>
        <pre className="overflow-x-auto text-xs font-mono bg-slate-900/80 p-3 rounded border border-slate-800 text-slate-300">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  if (isLoading || !svgHtml) {
    return (
      <div
        className={`my-4 p-6 rounded-lg border border-slate-800 bg-slate-900/40 text-center text-xs text-slate-400 animate-pulse ${className}`}
        data-testid="mermaid-loading"
      >
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      className={`my-4 p-4 rounded-lg border border-slate-700 bg-slate-900/60 flex justify-center overflow-x-auto [&>svg]:max-w-full [&>svg]:h-auto ${className}`}
      role="img"
      aria-label="Concept diagram"
      data-testid="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
};
