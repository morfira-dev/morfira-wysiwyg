import { maximumHTMLLength, maximumNodes } from '../document/budget.js';
import type { EditorDocument, ElementNode, DocumentNode } from '../document/types.js';
import type { DocumentSchema } from '../schema/types.js';
import type { StructuralMappingStep, StructuralNodePath } from './types.js';
import type { NodePositionRecord, PreparedStructuralMapping, StructuralPositionStep } from './internal-types.js';

const prefix = (a: readonly number[], b: readonly number[]): boolean => a.length <= b.length && a.every((value, index) => value === b[index]);
const equal = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && prefix(a, b);
const elements = (children: readonly DocumentNode[]): ElementNode[] => children.filter((node): node is ElementNode => node.type === 'element');
export const checkedStructuralPath = (value: unknown, root = false): number[] => {
  if (!Array.isArray(value) || (!root && !value.length) || value.length > 64
    || value.some((index) => !Number.isSafeInteger(index) || index < 0 || index > 100000)) throw new RangeError('Invalid structural element path.');
  return [...value];
};
export const structuralNode = (document: EditorDocument, path: readonly number[]): ElementNode => {
  let children = document.children;
  let node: ElementNode | undefined;
  for (const index of path) {
    node = elements(children)[index];
    if (!node) throw new RangeError('Structural path does not exist.');
    children = node.children;
  }
  if (!node) throw new RangeError('A leaf path is required.');
  return node;
};
export const structuralText = (node: ElementNode): string | undefined => {
  if (!/^(?:p|h[1-6]|li)$/.test(node.tag) || Object.hasOwn(node.attributes, 'data-mw-node')) return;
  if (node.children.length === 1 && node.children[0].type === 'element' && node.children[0].tag === 'br' && !Object.keys(node.children[0].attributes).length && !node.children[0].children.length) return '';
  if (node.children.some((child) => child.type !== 'text')) return;
  return node.children.map((child) => child.type === 'text' ? child.text : '').join('');
};
/** A first lazy capture must not confuse sanitized model paths with foreign DOM. */
export const structuralDOMLeaf = (surface: HTMLElement, document: EditorDocument, path: readonly number[]): ElementNode | undefined => {
  let actual: Element = surface;
  let children = document.children;
  let model: ElementNode | undefined;
  for (const index of path) {
    const expected = elements(children);
    if (actual.children.length !== expected.length) return;
    const next = actual.children[index];
    model = expected[index];
    if (!next || !model || Object.hasOwn(model.attributes, 'data-mw-node') || next.namespaceURI !== 'http://www.w3.org/1999/xhtml' || next.localName !== model.tag) return;
    actual = next;
    children = model.children;
  }
  if (!model || structuralText(model) === undefined || actual.textContent !== structuralText(model)) return;
  if ([...actual.childNodes].some((child) => child.nodeType !== 3 && !(actual.childNodes.length === 1 && child.nodeType === 1
    && (child as Element).namespaceURI === 'http://www.w3.org/1999/xhtml' && (child as Element).localName === 'br'))) return;
  return model;
};
const childrenAt = (document: EditorDocument, path: readonly number[]): DocumentNode[] => path.length ? structuralNode(document, path).children : document.children;
const slot = (document: EditorDocument, parent: readonly number[], index: number): number => {
  const children = childrenAt(document, parent);
  const allowed = elements(children);
  if (!Number.isSafeInteger(index) || index < 0 || index > allowed.length) throw new RangeError('Invalid structural child index.');
  return index === allowed.length ? children.length : children.indexOf(allowed[index]);
};
const accepts = (document: EditorDocument, parent: readonly number[], node: ElementNode): boolean => {
  let children = document.children;
  let tag: string = 'root';
  for (const index of parent) {
    const ancestor = elements(children)[index];
    if (!ancestor) throw new RangeError('Structural parent path does not exist.');
    if (Object.hasOwn(ancestor.attributes, 'data-mw-node')) return false;
    tag = ancestor.tag;
    children = ancestor.children;
  }
  const ordinary = /^(?:p|h[1-6])$/.test(node.tag);
  if (Object.hasOwn(node.attributes, 'data-mw-node')) return false;
  return tag === 'root' ? ordinary || node.tag === 'ul' || node.tag === 'ol'
    : tag === 'ul' || tag === 'ol' ? node.tag === 'li'
      : tag === 'li' ? ordinary || node.tag === 'ul' || node.tag === 'ol'
        : tag === 'blockquote' ? ordinary : false;
};
const validListShapes = (node: ElementNode): boolean => {
  if ((node.tag === 'ul' || node.tag === 'ol') && node.children.some((child) => child.type === 'text' ? /\S/.test(child.text) : child.tag !== 'li')) return false;
  if (node.tag === 'li' && node.children.some((child) => child.type === 'element' && child.tag === 'li')) return false;
  return node.children.every((child) => child.type !== 'element' || validListShapes(child));
};
const placeholder = (): DocumentNode[] => [{ type: 'element', tag: 'br', attributes: {}, children: [] }];
const textChildren = (text: string): DocumentNode[] => text ? [{ type: 'text', text }] : placeholder();
const parentOf = (path: readonly number[]): number[] => path.slice(0, -1);
const sibling = (path: readonly number[], delta: number): number[] => [...parentOf(path), path[path.length - 1] + delta];
const reindex = (path: number[], parent: readonly number[], index: number, delta: number): void => {
  if (path.length > parent.length && prefix(parent, path) && path[parent.length] >= index) path[parent.length] += delta;
};

/** Replay a bounded supported plan against validated data, never against arbitrary HTML. */
export const prepareStructuralMapping = (input: readonly StructuralMappingStep[], before: EditorDocument, schema: DocumentSchema): PreparedStructuralMapping => {
  if (!Array.isArray(input) || input.length > 32) throw new TypeError('Structural mapping accepts at most 32 steps.');
  const document = schema.validateDocument(before);
  const beforeHTML = schema.documentHTML(document);
  const steps: StructuralPositionStep[] = [];
  const inverse: StructuralPositionStep[] = [];
  let insertedHTML = 0;
  let insertedNodes = 0;
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Invalid structural mapping step.');
    const kind = raw.kind;
    const allowed = kind === 'split' ? ['kind', 'path', 'offset'] : kind === 'join' || kind === 'remove' ? ['kind', 'path']
      : kind === 'insert' ? ['kind', 'parent', 'index', 'nodes'] : kind === 'move' ? ['kind', 'path', 'parent', 'index'] : [];
    if (!allowed.length || Reflect.ownKeys(raw).some((key) => typeof key !== 'string' || !allowed.includes(key))) throw new TypeError('Unsupported structural mapping field.');
    if (kind === 'insert') {
      const parent = checkedStructuralPath(raw.parent, true);
      const index = raw.index;
      if (!Array.isArray(raw.nodes) || !raw.nodes.length || raw.nodes.length > 1000) throw new RangeError('Structural insertion needs 1–1000 nodes.');
      const validated = schema.validateDocument({ version: 1, children: raw.nodes });
      const nodes = validated.children;
      insertedHTML += schema.documentHTML(validated).length;
      const pending = [...nodes];
      while (pending.length) {
        const candidate = pending.pop()!;
        insertedNodes++;
        if (insertedNodes > maximumNodes) throw new RangeError('Aggregate structural insertion exceeds node limits.');
        if (candidate.type === 'element') for (const child of candidate.children) pending.push(child);
      }
      if (insertedHTML > maximumHTMLLength) throw new RangeError('Aggregate structural insertion exceeds serialized limits.');
      if (nodes.some((node) => node.type !== 'element' || !accepts(document, parent, node) || !validListShapes(node))) throw new TypeError('Unsupported structural insertion owner.');
      childrenAt(document, parent).splice(slot(document, parent, index), 0, ...nodes);
      schema.documentHTML(document);
      steps.push({ kind, parent, index, count: nodes.length });
      inverse.unshift(...nodes.map((_, ordinal) => ({ kind: 'remove' as const, path: [...parent, index + ordinal] })).reverse());
      continue;
    }
    const path = checkedStructuralPath(raw.path);
    const node = structuralNode(document, path);
    const parent = parentOf(path);
    const index = path[path.length - 1];
    const children = childrenAt(document, parent);
    const actual = children.indexOf(node);
    if (!accepts(document, parent, node)) throw new TypeError('Unsupported structural source owner.');
    if (kind === 'split') {
      const text = structuralText(node);
      if (text === undefined || node.tag === 'li' || !Number.isSafeInteger(raw.offset) || raw.offset < 0 || raw.offset > text.length) throw new RangeError('Split requires an ordinary text-only paragraph/heading and valid offset.');
      const right: ElementNode = { ...node, attributes: { ...node.attributes }, children: textChildren(text.slice(raw.offset)) };
      node.children = textChildren(text.slice(0, raw.offset));
      children.splice(actual + 1, 0, right);
      steps.push({ kind, path, offset: raw.offset });
      inverse.unshift({ kind: 'join', path, offset: raw.offset });
    }
    else if (kind === 'join') {
      const right = structuralNode(document, sibling(path, 1));
      const leftText = structuralText(node);
      const rightText = structuralText(right);
      if (leftText === undefined || rightText === undefined || node.tag === 'li' || right.tag === 'li') throw new TypeError('Join requires adjacent ordinary text-only paragraphs/headings.');
      if (children.indexOf(right) !== actual + 1) throw new TypeError('Join cannot cross intervening text.');
      node.children = textChildren(leftText + rightText);
      children.splice(actual + 1, 1);
      steps.push({ kind, path, offset: leftText.length });
      inverse.unshift({ kind: 'split', path, offset: leftText.length });
    }
    else if (kind === 'remove') {
      children.splice(actual, 1);
      steps.push({ kind, path });
      inverse.unshift({ kind: 'insert', parent, index, count: 1 });
    }
    else if (kind === 'move') {
      const destination = checkedStructuralPath(raw.parent, true);
      children.splice(actual, 1);
      if (!accepts(document, destination, node)) throw new TypeError('Unsupported structural destination owner.');
      childrenAt(document, destination).splice(slot(document, destination, raw.index), 0, node);
      const target = [...destination, raw.index];
      const sourceParentAfterRemoval = [...parent];
      // The inverse destination is read after removing the moved node again.
      steps.push({ kind, path, parent: destination, index: raw.index });
      inverse.unshift({ kind, path: target, parent: sourceParentAfterRemoval, index });
    }
    schema.documentHTML(document);
  }
  if (!document.children.length) {
    document.children.push({ type: 'element', tag: 'p', attributes: {}, children: placeholder() });
    steps.push({ kind: 'insert', parent: [], index: 0, count: 1 });
    inverse.unshift({ kind: 'remove', path: [0] });
  }
  const afterHTML = schema.documentHTML(schema.validateDocument(document));
  return { beforeHTML, afterHTML, steps, inverse };
};

export const inverseStructuralMapping = (mapping: PreparedStructuralMapping): PreparedStructuralMapping => ({
  beforeHTML: mapping.afterHTML, afterHTML: mapping.beforeHTML, steps: mapping.inverse, inverse: mapping.steps,
});

export const mapNodePosition = (record: NodePositionRecord, steps: readonly StructuralPositionStep[]): void => {
  for (const step of steps) {
    if (record.deleted) return;
    if (step.kind === 'split') {
      if (equal(record.path, step.path)) {
        if (record.offset > step.offset || record.offset === step.offset && record.association === 1) {
          record.path = sibling(step.path, 1);
          record.offset -= step.offset;
        }
      }
      else reindex(record.path, parentOf(step.path), step.path[step.path.length - 1] + 1, 1);
    }
    else if (step.kind === 'join') {
      const right = sibling(step.path, 1);
      if (equal(record.path, right)) { record.path = [...step.path]; record.offset += step.offset; }
      else reindex(record.path, parentOf(right), right[right.length - 1] + 1, -1);
    }
    else if (step.kind === 'insert') reindex(record.path, step.parent, step.index, step.count);
    else if (step.kind === 'remove') {
      if (prefix(step.path, record.path)) record.deleted = true;
      else reindex(record.path, parentOf(step.path), step.path[step.path.length - 1] + 1, -1);
    }
    else {
      const moved = prefix(step.path, record.path) ? record.path.slice(step.path.length) : undefined;
      if (!moved) reindex(record.path, parentOf(step.path), step.path[step.path.length - 1] + 1, -1);
      reindex(record.path, step.parent, step.index, 1);
      if (moved) record.path = [...step.parent, step.index, ...moved];
    }
  }
};
