import type { MarkdownBudget } from './internal-types.js';

export const maximumMarkdownLength = 1000000;
export const maximumMarkdownNodes = 10000;
export const maximumMarkdownDepth = 32;
export const assertMarkdownLength = (value: string): void => {
  if (typeof value !== 'string') throw new TypeError('Markdown must be a string.');
  if (value.length > maximumMarkdownLength) throw new RangeError('Markdown exceeds the size limit.');
};
export const createMarkdownBudget = (): MarkdownBudget => ({ nodes: 0, work: 0 });
export const consumeNode = (budget: MarkdownBudget, depth: number): void => {
  if (++budget.nodes > maximumMarkdownNodes || depth > maximumMarkdownDepth)
    throw new RangeError('Markdown exceeds structural limits.');
};
export const consumeWork = (budget: MarkdownBudget, amount: number): void => {
  budget.work += amount;
  if (budget.work > 32000000) throw new RangeError('Markdown exceeds the scan-work limit.');
};
