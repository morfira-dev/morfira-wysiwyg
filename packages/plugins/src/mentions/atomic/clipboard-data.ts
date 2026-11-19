import type { DocumentNode, Editor, EditorDocument, ElementNode } from '@morfira-dev/wysiwyg-core';
import { mentionNodeName } from '../persistence.js';
import type { MentionClipboardData, MentionClipboardInput } from '../types.js';
import { atomicFlow, validAtomicMention } from './selection.js';

const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
const maximumLength = 5_000_000;

/** Restrict this clipboard slice to one ordinary inline flow, including cell paragraphs. */
export const clipboardFlow = (root: HTMLElement, range: Range): HTMLElement | undefined => {
  const flow = atomicFlow(root, range.startContainer);
  if (!flow || atomicFlow(root, range.endContainer) !== flow) return;
  for (const child of flow.querySelectorAll('*')) {
    if (!range.intersectsNode(child)) continue;
    if (validAtomicMention(root, child)) continue;
    if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      || child.hasAttribute('data-mw-node') || !inline.has(child.localName)) return;
  }
  return flow;
};

const visibleText = (nodes: readonly DocumentNode[]): string => nodes.map((node) => node.type === 'text'
  ? node.text : node.tag === 'br' ? '\n' : visibleText(node.children)).join('');

/** Reconstruct selected data directly: cloning live resource DOM could trigger a fetch. */
export const selectedClipboardData = (editor: Editor, range: Range, flow: HTMLElement): MentionClipboardData => {
  let visits = 0;
  let length = 0;
  const read = (node: Node, depth: number): DocumentNode[] => {
    if (++visits > 100_000 || depth > 100) throw new RangeError('Mention clipboard fragment exceeds document limits.');
    if (!range.intersectsNode(node)) return [];
    if (node.nodeType === 3) {
      const source = node.textContent ?? '';
      const start = range.startContainer === node ? range.startOffset : 0;
      const end = range.endContainer === node ? range.endOffset : source.length;
      const text = source.slice(start, end);
      length += text.length;
      if (length > maximumLength) throw new RangeError('Mention clipboard text exceeds document limits.');
      return text ? [{ type: 'text', text }] : [];
    }
    if (node.nodeType !== 1) return [];
    const element = node as Element;
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      || (!validAtomicMention(editor.surface, element) && (!inline.has(element.localName) || element.hasAttribute('data-mw-node'))))
      throw new TypeError('Unsupported atomic mention clipboard source.');
    const children = [...node.childNodes].flatMap((child) => read(child, depth + 1));
    if (!children.length && element.localName !== 'br') return [];
    return [{ type: 'element', tag: element.localName as ElementNode['tag'],
      attributes: Object.fromEntries([...element.attributes].map((attribute) => [attribute.name, attribute.value])), children }];
  };
  const value = editor.schema.validateDocument({ version: 1,
    children: [...flow.childNodes].flatMap((node) => read(node, 0)) });
  return { html: editor.schema.documentHTML(value), text: visibleText(value.children) };
};

export const validateClipboardInput = (input: MentionClipboardInput): void => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => key !== 'html' && key !== 'text')
    || (input.html !== undefined && typeof input.html !== 'string')
    || (input.text !== undefined && typeof input.text !== 'string'))
    throw new TypeError('Expected mention clipboard html/text strings.');
};

export const clipboardHTMLHasMention = (root: HTMLElement, html: string): boolean => {
  if (!/\bdata-mw-node\s*=/i.test(html)) return false;
  if (html.length > maximumLength) return true;
  const template = root.ownerDocument.createElement('template');
  template.innerHTML = html;
  return [...template.content.querySelectorAll('[data-mw-node]')].some((node) => node.getAttribute('data-mw-node') === mentionNodeName);
};

export const parseClipboardData = (editor: Editor, input: MentionClipboardInput): EditorDocument | undefined => {
  const html = input.html ?? '';
  const text = input.text ?? '';
  if (html.length > maximumLength || text.length > maximumLength) return;
  try {
    let value: EditorDocument;
    if (html) {
      const template = editor.surface.ownerDocument.createElement('template');
      template.innerHTML = html;
      for (const element of template.content.querySelectorAll('*')) {
        if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml'
          || ['img', 'iframe', 'object', 'embed', 'table', 'figure', 'hr'].includes(element.localName)
          || (element.hasAttribute('data-mw-node') && element.getAttribute('data-mw-node') !== mentionNodeName)) return;
      }
      value = editor.schema.parseHTML(html);
      if (value.children.length === 1 && value.children[0]?.type === 'element' && value.children[0].tag === 'p')
        value = { version: 1, children: value.children[0].children };
    }
    else {
      const normalized = text.replace(/\r\n?/g, '\n');
      let projectedNodes = 0;
      let segment = false;
      for (let index = 0; index < normalized.length; index++) {
        if (normalized[index] === '\n') {
          projectedNodes += 1 + Number(segment);
          segment = false;
          if (projectedNodes > 100_000) return;
        }
        else segment = true;
      }
      if (projectedNodes + Number(segment) > 100_000) return;
      const parts = normalized.split('\n');
      value = { version: 1, children: parts.flatMap((part, index): DocumentNode[] => [
        ...(index ? [{ type: 'element' as const, tag: 'br' as const, attributes: {}, children: [] }] : []),
        ...(part ? [{ type: 'text' as const, text: part }] : []),
      ]) };
    }
    let visits = 0;
    const supported = (nodes: readonly DocumentNode[], depth: number): boolean => depth <= 100 && nodes.every((node) => {
      if (++visits > 100_000) return false;
      if (node.type === 'text') return true;
      const semantic = node.attributes['data-mw-node'];
      return inline.has(node.tag) && (!semantic || semantic === mentionNodeName) && supported(node.children, depth + 1);
    });
    if (!value.children.length || !supported(value.children, 0)) return;
    return editor.schema.validateDocument(value);
  }
  catch { return undefined; }
};
