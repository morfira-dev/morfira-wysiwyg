import type { Editor } from '@morfira-dev/wysiwyg-core';
import { atomicNativeSelection, setAtomicSelection, validAtomicMention } from './selection.js';
import type { AtomicPresentation } from './types.js';

/** The schema never stores this derived annotation; only changed subtrees are scanned. */
export const createAtomicPresentation = (editor: Editor): AtomicPresentation => {
  const root = editor.surface;
  const owned = new Map<HTMLSpanElement, string | null>();
  let disposed = false;
  let annotationRevision = 0;
  const release = (element: HTMLSpanElement): void => {
    if (!owned.has(element)) return;
    const previous = owned.get(element)!;
    owned.delete(element);
    if (element.getAttribute('contenteditable') !== 'false') return;
    if (previous === null) element.removeAttribute('contenteditable');
    else element.setAttribute('contenteditable', previous);
  };
  const consider = (element: Element): void => {
    const span = element as HTMLSpanElement;
    if (!validAtomicMention(root, element)) { release(span); return; }
    const value = element.getAttribute('contenteditable');
    if (!owned.has(span) || value !== 'false') owned.set(span, value);
    if (value !== 'false') {
      element.setAttribute('contenteditable', 'false');
      annotationRevision++;
    }
  };
  const scan = (node: Node, removed = false): void => {
    if (node.nodeType !== 1) return;
    const element = node as Element;
    for (const span of [element, ...element.querySelectorAll('span')]) {
      if (removed) release(span as HTMLSpanElement);
      else consider(span);
    }
  };
  const process = (records: readonly MutationRecord[]): void => {
    if (disposed) return;
    const revision = annotationRevision;
    const active = root.ownerDocument.activeElement;
    const selection = active === root || root.contains(active) ? atomicNativeSelection(root) : undefined;
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.removedNodes) if (!root.contains(node)) scan(node, true);
        for (const node of record.addedNodes) if (root.contains(node)) scan(node);
      }
      const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      if (target) consider(target);
    }
    // WebKit can retain the DOM Range while invalidating its native editing
    // position when an adjacent span becomes noneditable. Reinstall the saved
    // range after annotation, without focusing or changing document/history.
    if (selection && revision !== annotationRevision
      && root.contains(selection.range.startContainer) && root.contains(selection.range.endContainer)) {
      selection.native.removeAllRanges();
      setAtomicSelection(selection.native, selection.range, selection.backward);
    }
  };
  const view = root.ownerDocument.defaultView!;
  const observer = new view.MutationObserver(process);
  try {
    scan(root);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['data-mw-node', 'data-mention-id', 'contenteditable'] });
  }
  catch (error) {
    observer.disconnect();
    for (const element of [...owned.keys()]) release(element);
    throw error;
  }
  return {
    flush: () => process(observer.takeRecords()),
    destroy: () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      for (const element of [...owned.keys()]) release(element);
    },
  };
};
