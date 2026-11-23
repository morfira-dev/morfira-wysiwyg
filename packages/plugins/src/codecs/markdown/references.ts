import { consumeWork } from './budget.js';
import { readMarkdownDestination, referenceLabel } from './destinations.js';
import type { MarkdownParserContext } from './internal-types.js';

/** Definitions are data-only and collected in the block pass before inline parsing. */
export const readMarkdownReference = (line: string, context: MarkdownParserContext): boolean => {
  consumeWork(context.budget, line.length);
  const match = /^ {0,3}\[((?:\\.|[^\[\]\\]){1,999})\]:[ \t]*(.*)$/.exec(line);
  if (!match) return false;
  const label = referenceLabel(match[1]);
  const wrapped = `(${match[2]})`;
  const destination = readMarkdownDestination(wrapped, 0, context);
  if (!label || !destination || destination.end !== wrapped.length) return false;
  if (!context.references.has(label)) {
    if (context.references.size >= 10000) throw new RangeError('Markdown exceeds 10000 reference definitions.');
    context.references.set(label, { href: destination.href,
      ...(destination.title === undefined ? {} : { title: destination.title }) });
  }
  return true;
};
