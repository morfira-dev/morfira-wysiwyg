import { maximumHTMLLength } from '../document/budget.js';
import type { TextMappingStep } from './types.js';
import type { PositionRecord, PreparedTextMapping } from './internal-types.js';

/** Plans are sequential and bounded; every unchanged span is checked by replay. */
export const prepareTextMapping = (input: readonly TextMappingStep[], before: string): PreparedTextMapping => {
  if (!Array.isArray(input) || input.length > 64)
    throw new TypeError('Mapping accepts at most 64 replacement steps.');
  let text = before;
  const steps: TextMappingStep[] = [];
  const inverse: TextMappingStep[] = [];
  let inserted = 0;
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !['from', 'to', 'insert'].includes(key)))
      throw new TypeError('Invalid mapping step.');
    const { from, to, insert } = value;
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to > text.length || typeof insert !== 'string')
      throw new RangeError('Invalid mapping offsets or text.');
    inserted += insert.length;
    if (inserted > maximumHTMLLength || text.length - (to - from) + insert.length > maximumHTMLLength)
      throw new RangeError('Mapping exceeds document limits.');
    steps.push(Object.freeze({ from, to, insert }));
    inverse.unshift(Object.freeze({ from, to: from + insert.length, insert: text.slice(from, to) }));
    text = text.slice(0, from) + insert + text.slice(to);
  }
  return { before, after: text, steps: Object.freeze(steps), inverse: Object.freeze(inverse) };
};

export const inverseTextMapping = (mapping: PreparedTextMapping): PreparedTextMapping => ({
  before: mapping.after,
  after: mapping.before,
  steps: mapping.inverse,
  inverse: mapping.steps,
});

/** Map only declared changes; deletion is sticky and never revives an identity. */
export const mapPositionRecord = (record: PositionRecord, steps: readonly TextMappingStep[]): void => {
  for (const { from, to, insert } of steps) {
    const index = record.index;
    if (index < from) continue;
    if (index > to) {
      record.index += insert.length - (to - from);
      continue;
    }
    if (from === to) {
      if (record.association === 1) record.index += insert.length;
      continue;
    }
    if (index === from) record.index = from;
    else if (index === to) record.index = from + insert.length;
    else {
      record.deleted = true;
      record.index = from + (record.association === 1 ? insert.length : 0);
    }
  }
};
