import React, { useMemo } from 'react';
import katex from 'katex';

export interface KaTeXBlockProps {
  math: string;
  displayMode?: boolean;
  className?: string;
}

export const KaTeXBlock: React.FC<KaTeXBlockProps> = ({
  math,
  displayMode = false,
  className = '',
}) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      return math;
    }
  }, [math, displayMode]);

  return (
    <span
      className={`katex-wrapper ${displayMode ? 'block my-2 text-center' : 'inline'} ${className}`}
      data-testid={displayMode ? 'katex-display-block' : 'katex-inline-block'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
