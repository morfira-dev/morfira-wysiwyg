import { parseHTML, validateDocument, renderDocument, documentHTML } from '../document/index.js';
import { safeURL } from '../document/security.js';
import type { DocumentAttributeResolver } from '../document/internal-types.js';
import type { CompiledAttribute, CompiledSchemaNode } from './internal-types.js';
import type { DocumentTag, EditorDocument } from '../document/types.js';
import type { DocumentSchema, SchemaNodeSpec } from './types.js';

export type { DocumentSchema, SchemaAttributeSpec, SchemaNodeSpec } from './types.js';

const inlineTags = ['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'code'];
const blockTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'figure', 'figcaption'];
const supportedTag = (kind: unknown, tag: unknown): tag is DocumentTag => typeof tag === 'string' && (kind === 'block' ? blockTags : kind === 'inline' ? inlineTags : []).includes(tag);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const keysWithin = (value: Record<string, unknown>, allowed: readonly string[]) => {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError('Unknown schema definition field.');
};
const compileAttribute = (input: unknown): CompiledAttribute => {
  if (!record(input)) throw new TypeError('Schema attribute must be an object.');
  if (input.required !== undefined && typeof input.required !== 'boolean') throw new TypeError('Schema attribute required must be boolean.');
  const required = input.required === true;
  let read: (value: string) => string;
  if (input.type === 'text') {
    keysWithin(input, ['type', 'required', 'maxLength']);
    const limit = input.maxLength ?? 256;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0 || limit > 20000) throw new RangeError('Schema text maxLength must be from 0 to 20000.');
    read = (value) => {
      if (value.length > limit) throw new RangeError('Schema text exceeds its maximum length.');
      return value;
    };
  }
  else if (input.type === 'enum') {
    keysWithin(input, ['type', 'required', 'values']);
    if (!Array.isArray(input.values) || !input.values.length || input.values.length > 64 || input.values.some((value) => typeof value !== 'string' || value.length > 20000))
      throw new TypeError('Schema enum needs 1 to 64 bounded string values.');
    const values = new Set(input.values);
    read = (value) => {
      if (!values.has(value)) throw new TypeError('Invalid schema enum value.');
      return value;
    };
  }
  else if (input.type === 'integer') {
    keysWithin(input, ['type', 'required', 'min', 'max']);
    const min = input.min;
    const max = input.max;
    if (typeof min !== 'number' || typeof max !== 'number' || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) throw new RangeError('Schema integer bounds must be safe ordered integers.');
    read = (value) => {
      const number = Number(value);
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) throw new RangeError('Schema integer is outside its bounds.');
      return String(number);
    };
  }
  else if (input.type === 'url') {
    keysWithin(input, ['type', 'required']);
    read = (value) => {
      const clean = safeURL(value, false);
      if (clean === undefined) throw new TypeError('Unsupported or unsafe schema URL.');
      return clean;
    };
  }
  else throw new TypeError('Unknown schema attribute type.');
  return Object.freeze({
    required,
    read: (value: unknown) => {
      if (typeof value !== 'string' || value.length > 20000) throw new TypeError('Schema attribute must be a bounded string.');
      return read(value);
    },
  });
};

export const createDocumentSchema = (nodes: readonly SchemaNodeSpec[] = []): DocumentSchema => {
  if (!Array.isArray(nodes) || nodes.length > 128) throw new TypeError('Schema nodes must be an array of at most 128 definitions.');
  const registry = new Map<string, CompiledSchemaNode>();
  for (const node of nodes) {
    if (!record(node)) throw new TypeError('Schema node must be an object.');
    keysWithin(node, ['name', 'kind', 'tag', 'attributes']);
    if (typeof node.name !== 'string' || node.name.length > 128 || !/^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/.test(node.name))
      throw new TypeError('Schema node names must be bounded namespaced identifiers.');
    if (registry.has(node.name)) throw new Error(`Duplicate schema node: ${node.name}`);
    if (!supportedTag(node.kind, node.tag))
      throw new TypeError('Schema node tag must match its supported block or inline kind.');
    const rules = node.attributes ?? {};
    if (!record(rules) || Object.keys(rules).length > 64) throw new TypeError('Schema node attributes must be a bounded record.');
    const attributes = new Map<string, CompiledAttribute>();
    for (const [name, rule] of Object.entries(rules)) {
      if (!/^data-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name.startsWith('data-mw-'))
        throw new TypeError('Schema attributes must use non-reserved lowercase data-* names.');
      attributes.set(name, compileAttribute(rule));
    }
    registry.set(node.name, Object.freeze({ tag: node.tag, attributes }));
  }
  const resolve: DocumentAttributeResolver = (tag, input, source, originalTag) => {
    if (!Object.hasOwn(input, 'data-mw-node')) return {};
    const marker = input['data-mw-node'];
    const node = typeof marker === 'string' ? registry.get(marker) : undefined;
    if (typeof marker !== 'string' || !node) {
      if (source === 'json') throw new TypeError('Unregistered schema node.');
      return {};
    }
    if (tag !== node.tag || (originalTag !== undefined && originalTag !== node.tag)) throw new TypeError('Schema node marker does not match its tag.');
    const output: Record<string, string> = { 'data-mw-node': marker };
    for (const [name, rule] of node.attributes) {
      if (Object.hasOwn(input, name)) output[name] = rule.read(input[name]);
      else if (rule.required) throw new TypeError(`Missing required schema attribute: ${name}`);
    }
    return output;
  };
  const validate: DocumentSchema['validateDocument'] = (input) => validateDocument(input, resolve);
  const parse: DocumentSchema['parseHTML'] = (html) => parseHTML(html, resolve);
  return Object.freeze({
    parseHTML: parse,
    validateDocument: validate,
    renderDocument: (value: EditorDocument) => renderDocument(validate(value)),
    documentHTML: (value: EditorDocument) => documentHTML(validate(value)),
    sanitizeHTML: (html: string) => documentHTML(parse(html)),
  });
};
