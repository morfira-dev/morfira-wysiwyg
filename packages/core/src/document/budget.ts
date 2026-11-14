import type { DocumentBudget } from './internal-types.js';

export const maximumHTMLLength = 5000000;
export const maximumNodes = 100000;
export const maximumDepth = 100;
const voidTags = new Set(['br', 'hr', 'img', 'col']);

const consume = (budget: DocumentBudget, length: number): void => {
  if (length > maximumHTMLLength - budget.htmlLength) throw new RangeError('Document serialized HTML exceeds size limit.');
  budget.htmlLength += length;
};
const escaped = (budget: DocumentBudget, value: string, attribute = false): void => {
  const remaining = maximumHTMLLength - budget.htmlLength;
  let length = value.length;
  if (length > remaining) throw new RangeError('Document serialized HTML exceeds size limit.');
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    length += code === 38 ? 4 : code === 60 || code === 62 ? 3 : code === 160 || (attribute && code === 34) ? 5 : 0;
    if (length > remaining) throw new RangeError('Document serialized HTML exceeds size limit.');
  }
  budget.htmlLength += length;
};

export const countText = (budget: DocumentBudget, value: string): void => escaped(budget, value);
export const countElement = (budget: DocumentBudget, tag: string, attributes: Record<string, string>): void => {
  consume(budget, voidTags.has(tag) ? tag.length + 2 : 2 * tag.length + 5);
  for (const [name, value] of Object.entries(attributes)) {
    consume(budget, name.length + 4);
    escaped(budget, value, true);
  }
};
