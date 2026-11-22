import React, { memo, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Renders short, single-line AI text (milestone titles and descriptions) as
 * plain text, typesetting only `$…$` / `$$…$$` spans with KaTeX.
 *
 * Unlike RichMarkdownRenderer this emits no block elements, so it can sit
 * inside an <h3> or <p> and keep `line-clamp` working, and it never
 * interprets Markdown in the surrounding text.
 */

export type MathTextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; raw: string };

/**
 * Splits text into plain and math segments.
 *
 * A span counts as math only when it is non-empty, its content doesn't
 * start or end with whitespace, and the closing `$` isn't followed by a
 * digit (the Pandoc rules), so prices such as "$5 and $10" or "$5-$10" stay
 * as text. `\$` is a literal dollar sign.
 */
export function splitMathSegments(input: string): MathTextSegment[] {
  const segments: MathTextSegment[] = [];
  let text = '';
  let i = 0;

  const pushText = () => {
    if (text) {
      segments.push({ kind: 'text', value: text });
      text = '';
    }
  };

  while (i < input.length) {
    const ch = input[i];

    if (ch === '\\' && input[i + 1] === '$') {
      text += '$';
      i += 2;
      continue;
    }

    if (ch === '$') {
      const delimiter = input[i + 1] === '$' ? '$$' : '$';
      const start = i + delimiter.length;
      const end = findClosingDelimiter(input, start, delimiter);

      if (end !== -1) {
        const body = input.slice(start, end);
        const after = input[end + delimiter.length] ?? '';
        if (body.trim() !== '' && !/^\s|\s$/.test(body) && !/\d/.test(after)) {
          pushText();
          segments.push({
            kind: 'math',
            value: body,
            raw: input.slice(i, end + delimiter.length),
          });
          i = end + delimiter.length;
          continue;
        }
      }
    }

    text += ch;
    i += 1;
  }

  pushText();
  return segments;
}

function findClosingDelimiter(input: string, from: number, delimiter: string): number {
  for (let j = from; j < input.length; j += 1) {
    const ch = input[j];
    if (ch === '\n') return -1;
    if (ch === '\\') {
      j += 1; // skip the escaped character (e.g. `\$` inside math)
      continue;
    }
    if (input.startsWith(delimiter, j)) {
      // A lone `$` must not close on the first half of a `$$`.
      if (delimiter === '$' && input[j + 1] === '$') return -1;
      return j;
    }
  }
  return -1;
}

/** Renders TeX to KaTeX HTML, or null when it doesn't parse. */
function renderTex(tex: string): string | null {
  try {
    return katex.renderToString(tex, {
      displayMode: false,
      throwOnError: true,
      output: 'htmlAndMathml',
      // Default trust is false; stated explicitly because the output is
      // injected as HTML and the TeX comes from the model.
      trust: false,
      strict: 'ignore',
    });
  } catch {
    return null;
  }
}

/**
 * Plain-text version of the same string for `title` tooltips: math spans are
 * replaced by the text of KaTeX's MathML (e.g. `$w: E \to \mathbb{R}$` →
 * "w:E→R"), so the tooltip never shows LaTeX source either.
 */
export function mathTextToPlain(input: string): string {
  return splitMathSegments(input)
    .map((segment) => {
      if (segment.kind === 'text') return segment.value;
      return texToPlain(segment.value) ?? segment.raw;
    })
    .join('');
}

function texToPlain(tex: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  let mathml: string;
  try {
    mathml = katex.renderToString(tex, {
      displayMode: false,
      throwOnError: true,
      output: 'mathml',
      trust: false,
      strict: 'ignore',
    });
  } catch {
    return null;
  }
  // DOMParser builds an inert document: no scripts run, nothing loads.
  const doc = new DOMParser().parseFromString(mathml, 'text/html');
  doc.querySelectorAll('annotation').forEach((node) => node.remove());
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim() || null;
}

export interface InlineMathTextProps {
  text: string;
}

export const InlineMathText: React.FC<InlineMathTextProps> = memo(({ text }) => {
  const parts = useMemo(
    () =>
      splitMathSegments(text).map((segment) =>
        segment.kind === 'text'
          ? segment
          : { ...segment, html: renderTex(segment.value) }
      ),
    [text]
  );

  return (
    <>
      {parts.map((part, idx) => {
        if (part.kind === 'text') {
          return <React.Fragment key={idx}>{part.value}</React.Fragment>;
        }
        if (part.html === null) {
          // Unparseable TeX: show the source rather than a red KaTeX error.
          return <React.Fragment key={idx}>{part.raw}</React.Fragment>;
        }
        return (
          <span
            key={idx}
            data-testid="inline-math"
            // KaTeX output with trust disabled; see renderTex.
            dangerouslySetInnerHTML={{ __html: part.html }}
          />
        );
      })}
    </>
  );
});

InlineMathText.displayName = 'InlineMathText';
