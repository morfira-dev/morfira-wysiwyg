import { documentTags, parseHTML, validateDocument, renderDocument, documentHTML } from '../document/index.js';
import { safeURL } from '../document/security.js';
import type { DocumentAttributeResolver, DocumentElementValidator } from '../document/internal-types.js';
import type { CompiledAttribute, CompiledSchemaNode, CompiledTextContent } from './internal-types.js';
import type { DocumentTag, EditorDocument } from '../document/types.js';
import type { DocumentSchema, SchemaContribution } from './types.js';

export type { DocumentSchema, SchemaAttributeSpec, SchemaTextContentSpec, SchemaNodeSpec, SchemaAttributesSpec, SchemaContribution } from './types.js';

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
    keysWithin(input, ['type', 'required', 'minLength', 'maxLength', 'singleLine']);
    const limit = input.maxLength ?? 256;
    const minimum = input.minLength === undefined ? 0 : input.minLength;
    const singleLine = input.singleLine === undefined ? false : input.singleLine;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0 || limit > 20000) throw new RangeError('Schema text maxLength must be from 0 to 20000.');
    if (typeof minimum !== 'number' || !Number.isInteger(minimum) || minimum < 0 || minimum > limit) throw new RangeError('Schema text minLength must be from 0 through maxLength.');
    if (typeof singleLine !== 'boolean') throw new TypeError('Schema text singleLine must be boolean.');
    read = (value) => {
      if (value.length < minimum || value.length > limit) throw new RangeError('Schema text is outside its length bounds.');
      if (singleLine && /[\u0000-\u001f\u007f\u2028\u2029]/.test(value)) throw new TypeError('Schema text must be single-line without controls.');
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

export const createDocumentSchema = (nodes: readonly SchemaContribution[] = []): DocumentSchema => {
  if (!Array.isArray(nodes) || nodes.length > 128) throw new TypeError('Schema contributions must be an array of at most 128 definitions.');
  const registry = new Map<string, CompiledSchemaNode>();
  const names = new Set<string>();
  // The document boundary also resolves unsupported source tags to reject semantic mismatches.
  const tagAttributes = new Map<string, Map<string, CompiledAttribute>>();
  const splitPolicies = new Map<DocumentTag, Map<string, string>>();
  for (const node of nodes) {
    if (!record(node)) throw new TypeError('Schema contribution must be an object.');
    keysWithin(node, node.kind === 'attributes' ? ['name', 'kind', 'tag', 'attributes', 'split'] : ['name', 'kind', 'tag', 'attributes', 'content']);
    if (typeof node.name !== 'string' || node.name.length > 128 || !/^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/.test(node.name))
      throw new TypeError('Schema names must be bounded namespaced identifiers.');
    if (names.has(node.name)) throw new Error(`Duplicate schema contribution: ${node.name}`);
    names.add(node.name);
    const nonOwning = node.kind === 'attributes';
    if (nonOwning ? !documentTags.includes(node.tag as DocumentTag) : !supportedTag(node.kind, node.tag))
      throw new TypeError('Schema tag must match its supported kind.');
    const tag = node.tag as DocumentTag;
    const rules = node.attributes ?? (nonOwning ? undefined : {});
    if (!record(rules) || Object.keys(rules).length > 64) throw new TypeError('Schema attributes must be a bounded record.');
    const attributes = new Map<string, CompiledAttribute>();
    for (const [name, rule] of Object.entries(rules)) {
      if (!/^data-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name.startsWith('data-mw-'))
        throw new TypeError('Schema attributes must use non-reserved lowercase data-* names.');
      const compiled = compileAttribute(rule);
      if (nonOwning && compiled.required) throw new TypeError('Non-owning attributes must be optional.');
      attributes.set(name, compiled);
    }
    if (!nonOwning) {
      let content: CompiledTextContent | undefined;
      if (node.content !== undefined) {
        if (!record(node.content) || node.content.type !== 'text') throw new TypeError('Schema content must be a bounded text rule.');
        keysWithin(node.content, ['type', 'minLength', 'maxLength', 'singleLine']);
        const maxLength = node.content.maxLength === undefined ? 256 : node.content.maxLength;
        if (typeof maxLength !== 'number') throw new TypeError('Schema text content maxLength must be a number.');
        const rule = compileAttribute(node.content);
        content = { maxLength, rule };
      }
      registry.set(node.name, Object.freeze({ tag, attributes, ...(content ? { content } : {}) }));
      continue;
    }
    const existing = tagAttributes.get(tag) ?? new Map<string, CompiledAttribute>();
    for (const [name, rule] of attributes) {
      if (existing.has(name)) throw new TypeError(`Duplicate schema tag attribute: ${name}`);
      existing.set(name, rule);
    }
    if (existing.size > 64) throw new RangeError('Schema tag attributes exceed their bound.');
    tagAttributes.set(tag, existing);
    if (node.split !== undefined) {
      if (tag !== 'li' || !record(node.split)) throw new TypeError('Schema split policy must be an LI attribute record.');
      const policies = splitPolicies.get(tag) ?? new Map<string, string>();
      for (const [name, reset] of Object.entries(node.split)) {
        const rule = attributes.get(name);
        if (!rule) throw new TypeError('Schema split policy must reference its declared attribute.');
        policies.set(name, rule.read(reset));
      }
      splitPolicies.set(tag, policies);
    }
  }
  for (const node of registry.values()) {
    if ([...node.attributes.keys()].some((name) => tagAttributes.get(node.tag)?.has(name)))
      throw new TypeError('Non-owning and semantic attribute definitions must not overlap.');
  }
  const resolve: DocumentAttributeResolver = (tag, input, source, originalTag) => {
    const output: Record<string, string> = {};
    for (const [name, rule] of tagAttributes.get(tag) ?? []) {
      if (Object.hasOwn(input, name)) {
        if (originalTag !== undefined && originalTag !== tag) throw new TypeError('Schema attribute does not match its original tag.');
        output[name] = rule.read(input[name]);
      }
    }
    if (!Object.hasOwn(input, 'data-mw-node')) return output;
    const marker = input['data-mw-node'];
    const node = typeof marker === 'string' ? registry.get(marker) : undefined;
    if (typeof marker !== 'string' || !node) {
      if (source === 'json') throw new TypeError('Unregistered schema node.');
      return output;
    }
    if (tag !== node.tag || (originalTag !== undefined && originalTag !== node.tag)) throw new TypeError('Schema node marker does not match its tag.');
    output['data-mw-node'] = marker;
    for (const [name, rule] of node.attributes) {
      if (Object.hasOwn(input, name)) output[name] = rule.read(input[name]);
      else if (rule.required) throw new TypeError(`Missing required schema attribute: ${name}`);
    }
    return output;
  };
  const validateElement: DocumentElementValidator = (node) => {
    const content = registry.get(node.attributes['data-mw-node'])?.content;
    if (!content) return;
    const parts: string[] = [];
    let length = 0;
    for (const child of node.children) {
      if (child.type !== 'text') throw new TypeError('Schema text content cannot contain element nodes.');
      length += child.text.length;
      if (length > content.maxLength) throw new RangeError('Schema text content exceeds its maximum length.');
      parts.push(child.text);
    }
    content.rule.read(parts.join(''));
  };
  const validate: DocumentSchema['validateDocument'] = (input) => validateDocument(input, resolve, validateElement);
  const parse: DocumentSchema['parseHTML'] = (html) => parseHTML(html, resolve, validateElement);
  return Object.freeze({
    attributesForSplit: (tag: DocumentTag, input: Readonly<Record<string, string>>) => {
      if (!documentTags.includes(tag) || !record(input)) throw new TypeError('Expected a safe tag and attribute record.');
      const output: Record<string, string> = {};
      for (const [name, reset] of splitPolicies.get(tag) ?? []) {
        if (Object.hasOwn(input, name)) {
          tagAttributes.get(tag)!.get(name)!.read(input[name]);
          output[name] = reset;
        }
      }
      return output;
    },
    parseHTML: parse,
    validateDocument: validate,
    renderDocument: (value: EditorDocument) => renderDocument(validate(value)),
    documentHTML: (value: EditorDocument) => documentHTML(validate(value)),
    sanitizeHTML: (html: string) => documentHTML(parse(html)),
  });
};
