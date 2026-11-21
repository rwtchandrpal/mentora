/**
 * Server-side guard for AI-generated Mermaid diagrams.
 *
 * The model occasionally returns a diagram that is cut off mid-statement (for example
 * "graph TD\n  A["). The client falls back to raw code for those, so the learner loses the
 * diagram. Real `mermaid.parse` needs a DOM, so this performs a cheap structural check
 * instead and drops any ```mermaid block that is clearly incomplete.
 */

const MERMAID_FENCE = /```mermaid[^\S\n]*\n([\s\S]*?)(?:\n[^\S\n]*```|$)/g;

const OPEN_TO_CLOSE: Record<string, string> = { '[': ']', '(': ')', '{': '}' };
const CLOSERS = new Set(Object.values(OPEN_TO_CLOSE));

/** Returns true when the diagram body looks complete enough to be worth sending. */
export const isStructurallyCompleteMermaid = (body: string): boolean => {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('%%'));

  // A header alone (e.g. "graph TD") is not a diagram.
  if (lines.length < 2) return false;

  // Brackets and quotes must balance across the whole body.
  const stack: string[] = [];
  let inQuote = false;
  for (const ch of lines.join('\n')) {
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (inQuote) continue;
    if (OPEN_TO_CLOSE[ch]) {
      stack.push(OPEN_TO_CLOSE[ch]);
    } else if (CLOSERS.has(ch)) {
      if (stack.pop() !== ch) return false;
    }
  }
  if (inQuote || stack.length > 0) return false;

  // A trailing connector means the statement was cut off ("A -->", "A ---|label|").
  const last = lines[lines.length - 1] ?? '';
  if (/(-->|---|==>|-\.->|--|->|\||&|,)$/.test(last)) return false;

  return true;
};

/** Removes incomplete ```mermaid blocks from markdown; valid blocks are left untouched. */
export const stripInvalidMermaid = (markdown: string): string => {
  if (!markdown.includes('```mermaid')) return markdown;
  return markdown
    .replace(MERMAID_FENCE, (block, body: string) =>
      isStructurallyCompleteMermaid(body) ? block : ''
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
