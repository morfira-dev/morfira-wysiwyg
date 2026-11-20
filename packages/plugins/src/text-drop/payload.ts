import type { Editor, DocumentNode, EditorDocument } from '@morfira-dev/wysiwyg-core';
import type { DragPayload } from './internal-types.js';
import { inlineFragment, elementAt, flowAt } from './target.js';

export const privateDragType = 'application/x-morfira-text-drag';
export const maximumTransfer = 20000;
const forbidden = 'img,video,audio,source,track,canvas,figure,figcaption,pre,code,table,thead,tbody,tfoot,tr,td,th,caption,colgroup,col,ul,ol,li,blockquote,hr,script,style,iframe,object,embed,svg,math,template,form,input,textarea,button,select,link,meta,base,[data-mw-node],[contenteditable="false"]';
export const hasFiles = (transfer: DataTransfer): boolean => transfer.files.length > 0
  || [...transfer.items].some((item) => item.kind === 'file')
  || [...transfer.types].some((type) => type.toLowerCase() === 'files');
export const hasText = (transfer: DataTransfer): boolean => [...transfer.types].some((type) => ['text/plain', 'text/html'].includes(type.toLowerCase()));
const checkedLength = (value: string): void => {
  if (value.length > maximumTransfer) throw new RangeError('Text drag payload exceeds the supported bound.');
};
const textFor = (nodes: readonly DocumentNode[]): string => nodes.map((node) => node.type === 'text' ? node.text : node.tag === 'br' ? '\n' : textFor(node.children)).join('');
const inlineDocument = (value: EditorDocument): EditorDocument => {
  const meaningful = value.children.filter((node) => node.type !== 'text' || node.text.trim());
  const only = meaningful.length === 1 ? meaningful[0] : undefined;
  const children = only?.type === 'element' && /^p$|^h[1-6]$/.test(only.tag) ? only.children : value.children;
  const allowed = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'br']);
  const verify = (node: DocumentNode): void => {
    if (node.type === 'text') return;
    if (!allowed.has(node.tag) || node.attributes['data-mw-node']) throw new TypeError('Unsupported structural text drop content.');
    node.children.forEach(verify);
  };
  children.forEach(verify);
  return { version: 1, children };
};
export const payloadFromHTML = (editor: Editor, html: string): DragPayload => {
  checkedLength(html);
  const template = editor.surface.ownerDocument.createElement('template');
  // This parser is inert; its untrusted nodes are never inserted into live DOM.
  template.innerHTML = html;
  if (template.content.querySelector(forbidden) || [...template.content.querySelectorAll('*')].some((node) => node.namespaceURI !== 'http://www.w3.org/1999/xhtml'))
    throw new TypeError('Unsupported protected or resource text drop content.');
  const value = inlineDocument(editor.schema.parseHTML(html));
  const result = { html: editor.schema.documentHTML(value), text: textFor(value.children) };
  if (!result.html || (!result.text && !value.children.some((node) => node.type === 'element' && node.tag === 'br')))
    throw new TypeError('Text drop payload is empty.');
  checkedLength(result.html);
  checkedLength(result.text);
  return result;
};
export const payloadFromRange = (editor: Editor, range: Range): DragPayload => {
  const flow = flowAt(editor, range);
  if (!flow) throw new TypeError('Unsupported source range.');
  let fragment: Node = range.cloneContents();
  // cloneContents omits ancestors shared by both endpoints. Retain their marks.
  for (let ancestor = elementAt(range.commonAncestorContainer); ancestor && ancestor !== flow; ancestor = ancestor.parentElement) {
    const wrapper = ancestor.cloneNode(false);
    wrapper.appendChild(fragment);
    fragment = wrapper;
  }
  const template = editor.surface.ownerDocument.createElement('template');
  template.content.append(fragment);
  if (!inlineFragment(template.content)) throw new TypeError('Unsupported source range.');
  return payloadFromHTML(editor, template.innerHTML);
};
export const readPayload = (editor: Editor, transfer: DataTransfer): DragPayload => {
  const html = transfer.getData('text/html');
  const text = transfer.getData('text/plain');
  checkedLength(html);
  checkedLength(text);
  if (html) return payloadFromHTML(editor, html);
  if (!text) throw new TypeError('Text drop payload is empty.');
  const value: DocumentNode[] = [];
  for (const [index, line] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
    if (index) value.push({ type: 'element', tag: 'br', attributes: {}, children: [] });
    if (line) value.push({ type: 'text', text: line });
  }
  return { html: editor.schema.documentHTML({ version: 1, children: value }), text: text.replace(/\r\n?/g, '\n') };
};
