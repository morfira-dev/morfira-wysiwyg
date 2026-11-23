import type { CodeHighlightProvider, CodeHighlightToken } from '@morfira-dev/wysiwyg/ui/code-blocks';

/** A bounded demonstrative tokenizer, not a complete TypeScript grammar. */
export const highlight: CodeHighlightProvider = ({ source, language, signal }) => {
  signal.throwIfAborted();
  if (source.length > 20000) throw new RangeError('Example source is limited to 20000 UTF-16 units.');
  if (!['typescript', 'javascript'].includes(language)) return [];
  const result: CodeHighlightToken[] = [];
  const expression = /\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\b(?:const|let|return|if|else|async|await|export|import|true|false)\b|\b\d+(?:\.\d+)?\b/g;
  for (const match of source.matchAll(expression)) {
    if (result.length === 4096) break;
    const text = match[0];
    result.push({ from: match.index!, to: match.index! + text.length,
      kind: text.startsWith('//') ? 'comment' : /^["']/.test(text) ? 'string' : /^\d/.test(text) ? 'number' : 'keyword' });
  }
  return result;
};
