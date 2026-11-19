import type { Editor, EditorDocument, ElementNode } from '@morfira-dev/wysiwyg-core';
import { clipboardLeaves } from './clipboard-source.js';
import { setAtomicSelection } from './selection.js';
import type { AtomicClipboardSnapshot } from './types.js';

export const clipboardBlockPayload = (value?: EditorDocument): boolean => !!value?.children.some((node) =>
  node.type === 'element' && /^(p|h[1-6])$/.test(node.tag));

const singleBreak = (node: ParentNode): boolean => node.childNodes.length === 1
  && node.firstChild?.nodeType === 1 && (node.firstChild as Element).localName === 'br';

const placeholder = (element: HTMLElement): void => {
  if (!element.textContent && !element.querySelector('br')) element.append(element.ownerDocument.createElement('br'));
};

const emptyLeaf = (editor: Editor, source: HTMLElement): HTMLElement => {
  const value = editor.schema.validateDocument({ version: 1, children: [{ type: 'element',
    tag: source.localName as ElementNode['tag'],
    attributes: Object.fromEntries([...source.attributes].map((attribute) => [attribute.name, attribute.value])), children: [] }] });
  return editor.schema.renderDocument(value).firstChild as HTMLElement;
};

/** All extracted subtrees are prevalidated ordinary inline nodes, never resources. */
export const editClipboardSelection = (editor: Editor, plan: AtomicClipboardSnapshot, value?: EditorDocument): boolean => {
  const root = editor.surface;
  const document = root.ownerDocument;
  const first = plan.flow;
  const lastSource = plan.leaves.at(-1)!;
  const blocks = clipboardBlockPayload(value);
  const firstPlaceholder = singleBreak(first);
  const lastPlaceholder = singleBreak(lastSource);
  if (blocks && !clipboardLeaves(root, plan.range, true)) return false;
  const fragment = value ? editor.schema.renderDocument(value) : undefined;
  if (blocks && fragment!.children.length === 1 && !/^h[1-6]$/.test(fragment!.firstElementChild!.localName)) return false;
  const insertion = plan.range.cloneRange();
  insertion.collapse(true);
  // Same-flow inline insertion keeps its original exact behavior and affinity.
  if (plan.leaves.length === 1 && !blocks) {
    const last = fragment?.lastChild;
    plan.range.cloneRange().deleteContents();
    if (fragment && last) {
      insertion.insertNode(fragment);
      insertion.setStartAfter(last);
      insertion.collapse(true);
    }
    if (!first.textContent && !first.querySelector('br')) {
      placeholder(first);
      insertion.setStartBefore(first.lastChild!);
      insertion.collapse(true);
    }
  }
  else {
    const suffixRange = document.createRange();
    suffixRange.selectNodeContents(lastSource);
    suffixRange.setStart(plan.range.endContainer, plan.range.endOffset);
    const suffix = suffixRange.extractContents();
    // A lone BR here is the empty leaf's caret placeholder, not a selected line break.
    if (lastPlaceholder && singleBreak(suffix)) suffix.replaceChildren();
    const siblings: ChildNode[] = [];
    if (plan.leaves.length > 1) {
      for (let node = first.nextSibling; node; node = node.nextSibling) {
        siblings.push(node);
        if (node === lastSource) break;
      }
    }
    plan.range.cloneRange().deleteContents();
    for (const node of siblings) if (node.parentNode === plan.parent) node.remove();
    if (!blocks) {
      if (firstPlaceholder && singleBreak(first)) {
        first.replaceChildren();
        insertion.selectNodeContents(first);
        insertion.collapse(true);
      }
      const last = fragment?.lastChild;
      if (fragment && last) {
        insertion.insertNode(fragment);
        insertion.setStartAfter(last);
        insertion.collapse(true);
      }
      first.append(suffix);
      placeholder(first);
    }
    else {
      const incoming = [...fragment!.children] as HTMLElement[];
      const singleHeading = incoming.length === 1 && /^h[1-6]$/.test(incoming[0].localName);
      if (singleHeading) {
        const tail = emptyLeaf(editor, lastSource);
        tail.append(suffix);
        placeholder(first);
        placeholder(tail);
        placeholder(incoming[0]);
        first.after(incoming[0], tail);
        insertion.selectNodeContents(tail);
        insertion.collapse(true);
      }
      else {
        const head = incoming.shift()!;
        if (firstPlaceholder && singleBreak(first)) {
          first.replaceChildren();
          insertion.selectNodeContents(first);
          insertion.collapse(true);
        }
        if (singleBreak(head)) head.replaceChildren();
        const headFragment = document.createDocumentFragment();
        while (head.firstChild) headFragment.append(head.firstChild);
        insertion.insertNode(headFragment);
        const tail = incoming.at(-1)!;
        if (singleBreak(tail)) tail.replaceChildren();
        const boundary = tail.childNodes.length;
        tail.append(suffix);
        placeholder(first);
        placeholder(tail);
        const remainder = document.createDocumentFragment();
        for (const block of incoming) {
          placeholder(block);
          remainder.append(block);
        }
        first.after(remainder);
        insertion.setStart(tail, boundary);
        insertion.collapse(true);
      }
    }
  }
  const native = document.getSelection();
  if (native) setAtomicSelection(native, insertion);
  first.normalize();
  // Core captures/validates the full result within this same rollback boundary.
  return true;
};
