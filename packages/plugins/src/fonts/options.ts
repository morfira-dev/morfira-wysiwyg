import { createDocumentSchema } from '@morfira-dev/wysiwyg-core';
import type { ElementNode } from '@morfira-dev/wysiwyg-core';
import type { FontsOptions } from './types.js';
import type { FontConfiguration } from './internal-types.js';

const defaults = [
  { id: 'system', label: 'System', family: 'system-ui, sans-serif' },
  { id: 'serif', label: 'Serif', family: 'Georgia, serif' },
  { id: 'monospace', label: 'Monospace', family: 'monospace' },
];
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const choices = (value: unknown): value is unknown[] => Array.isArray(value) && value.length >= 1 && value.length <= 32;

/** Use the public pure codec; configuration is validated before browser setup. */
export const fontConfiguration = (options: FontsOptions): FontConfiguration => {
  if (!record(options) || Object.keys(options).some((key) => key !== 'families' && key !== 'sizes'))
    throw new TypeError('Expected font options.');
  const families = options.families === undefined ? defaults : options.families;
  const sizes = options.sizes === undefined ? [12, 14, 16, 18, 24, 32, 48] : options.sizes;
  if (!choices(families) || !choices(sizes)) throw new TypeError('Font lists must have 1–32 choices.');
  const schema = createDocumentSchema();
  const ids = new Set<string>();
  const values = new Set<string>();
  const copied = Array.from(families, (entry) => {
    if (!record(entry) || Object.keys(entry).some((key) => !['id', 'label', 'family'].includes(key))
      || typeof entry.id !== 'string' || !/^[a-z][a-z\d-]{0,63}$/.test(entry.id)
      || typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 100 || /[\u0000-\u001f\u007f]/.test(entry.label)
      || typeof entry.family !== 'string' || !entry.family || entry.family.length > 256 || /[;{}\u0000-\u001f\u007f]/.test(entry.family))
      throw new TypeError('Invalid font family choice.');
    const node = schema.validateDocument({ version: 1, children: [{ type: 'element', tag: 'span', attributes: { style: `font-family: ${entry.family}` }, children: [] }] }).children[0] as ElementNode;
    const style = node.attributes.style;
    const prefix = 'font-family: ';
    if (!style?.startsWith(prefix)) throw new TypeError('Unsupported font family.');
    const family = style.slice(prefix.length);
    if (ids.has(entry.id) || values.has(family.toLowerCase())) throw new TypeError('Font family choices must be unique.');
    ids.add(entry.id);
    values.add(family.toLowerCase());
    return { id: entry.id, label: entry.label, family };
  });
  const copiedSizes = Array.from(sizes, (size) => {
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 8 || size > 96)
      throw new TypeError('Font sizes must be integers from 8 to 96 px.');
    return size;
  });
  if (new Set(copiedSizes).size !== copiedSizes.length) throw new TypeError('Font sizes must be unique.');
  return { families: copied, sizes: copiedSizes };
};
