import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createAtomicPresentation } from './presentation.js';
import { adjacentAtomicMention, atomicAncestor, atomicBoundary, atomicFlow, atomicNativeSelection,
  atomicOffset, atomsInRange, expandedAtomicRange, setAtomicSelection, validAtomicMention } from './selection.js';

const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
const sameRange = (a: Range, b: Range): boolean => a.startContainer === b.startContainer && a.startOffset === b.startOffset
  && a.endContainer === b.endContainer && a.endOffset === b.endOffset;

/** Mention-only input policy; document commands and model validation remain core-owned. */
export const setupAtomicMentions = (editor: Editor): (() => void) => {
  const root = editor.surface;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const presentation = createAtomicPresentation(editor);
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let composing = false;
  let changing = false;
  let revision = 0;
  const focused = (): boolean => document.activeElement === root || root.contains(document.activeElement);
  const normalize = (): void => {
    if (disposed || changing || composing || !focused()) return;
    const selected = atomicNativeSelection(root);
    if (!selected) return;
    const { range, native, backward } = selected;
    let next: Range;
    if (range.collapsed) {
      const atom = atomicAncestor(root, range.startContainer);
      if (!atom) return;
      const after = atomicOffset(atom, range.startContainer, range.startOffset) * 2 >= atom.textContent!.length;
      const point = atomicBoundary(atom, after);
      next = document.createRange();
      next.setStart(point.node, point.offset);
      next.collapse(true);
    }
    else next = expandedAtomicRange(root, range);
    if (!sameRange(range, next)) {
      changing = true;
      try { setAtomicSelection(native, next, backward); }
      finally { changing = false; }
    }
  };
  const ordinary = (range: Range): HTMLElement | undefined => {
    const first = atomicFlow(root, range.startContainer);
    if (!first || atomicFlow(root, range.endContainer) !== first) return;
    if (range.startContainer === range.endContainer && range.startContainer.nodeType === 1
      && range.endOffset === range.startOffset + 1) {
      const child = range.startContainer.childNodes[range.startOffset];
      if (child?.nodeType === 1 && validAtomicMention(root, child as Element)
        && atomicFlow(root, child) === first) return first;
    }
    for (const child of first.querySelectorAll('*')) {
      if (!range.intersectsNode(child)) continue;
      if (validAtomicMention(root, child)) continue;
      if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml' || child.hasAttribute('data-mw-node') || !inline.has(child.localName)) return;
    }
    return first;
  };
  const mutate = (original: Range, deletion: Range, replacement?: string): void => {
    const flow = ordinary(deletion);
    if (!flow) return;
    const generation = revision;
    changing = true;
    try {
      editor.transact(() => {
        const current = atomicNativeSelection(root);
        if (disposed || composing || editor.isReadOnly() || revision !== generation || !current
          || !sameRange(current.range, original) || !root.contains(flow) || !ordinary(deletion)) return;
        const next = deletion.cloneRange();
        next.deleteContents();
        next.collapse(true);
        if (replacement) {
          const text = document.createTextNode(replacement);
          next.insertNode(text);
          next.setStart(text, text.length);
          next.collapse(true);
        }
        if (!flow.textContent && !flow.querySelector('br,img,hr')) {
          const placeholder = document.createElement('br');
          flow.append(placeholder);
          next.setStartBefore(placeholder);
          next.collapse(true);
        }
        const native = document.getSelection();
        if (native) setAtomicSelection(native, next);
        flow.normalize();
      });
    }
    catch (error) {
      if (!disposed && !composing && !editor.isReadOnly() && revision === generation) throw error;
    }
    finally {
      changing = false;
      if (!disposed) presentation.flush();
    }
  };
  const deletionFor = (range: Range, backward: boolean): Range | undefined => {
    if (!range.collapsed) return atomsInRange(root, range).length ? expandedAtomicRange(root, range) : undefined;
    const atom = adjacentAtomicMention(root, { node: range.startContainer, offset: range.startOffset }, backward ? -1 : 1);
    if (!atom) return;
    const next = document.createRange();
    next.selectNode(atom);
    return next;
  };
  const cancel = (event: Event): void => { event.preventDefault(); event.stopImmediatePropagation(); };
  const keydown = (event: KeyboardEvent): void => {
    if (disposed || event.defaultPrevented || !event.cancelable || composing || event.isComposing || event.keyCode === 229) return;
    normalize();
    const selected = atomicNativeSelection(root);
    if (!selected || !focused() || event.altKey || event.ctrlKey || event.metaKey) return;
    const { range, native } = selected;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (!event.shiftKey && !range.collapsed) return;
      if (!native.focusNode) return;
      const flow = atomicFlow(root, native.focusNode);
      if (!flow) return;
      const rtl = view.getComputedStyle(flow).direction === 'rtl';
      const direction = (event.key === 'ArrowRight') !== rtl ? 1 : -1;
      const atom = adjacentAtomicMention(root, { node: native.focusNode, offset: native.focusOffset }, direction);
      if (!atom) return;
      const point = atomicBoundary(atom, direction > 0);
      cancel(event);
      if (event.shiftKey && native.anchorNode) native.setBaseAndExtent(native.anchorNode, native.anchorOffset, point.node, point.offset);
      else {
        const next = document.createRange();
        next.setStart(point.node, point.offset);
        next.collapse(true);
        setAtomicSelection(native, next);
      }
      return;
    }
    if (editor.isReadOnly() || (event.key !== 'Backspace' && event.key !== 'Delete')) return;
    const deletion = deletionFor(range, event.key === 'Backspace');
    if (!deletion) return;
    cancel(event);
    mutate(range, deletion);
  };
  const beforeinput = (event: InputEvent): void => {
    if (disposed || event.defaultPrevented || !event.cancelable || composing || event.isComposing || editor.isReadOnly()) return;
    normalize();
    const selected = atomicNativeSelection(root);
    if (!selected || !focused()) return;
    const { range } = selected;
    const backward = event.inputType === 'deleteContentBackward';
    const forward = event.inputType === 'deleteContentForward';
    if (backward || forward) {
      const deletion = deletionFor(range, backward);
      if (!deletion) return;
      cancel(event);
      mutate(range, deletion);
      return;
    }
    if (range.collapsed || !atomsInRange(root, range).length) return;
    if (event.inputType.startsWith('insert') || event.inputType.startsWith('delete')) {
      cancel(event);
      if (event.inputType === 'insertText' && typeof event.data === 'string') mutate(range, expandedAtomicRange(root, range), event.data);
      else if (event.inputType === 'deleteByCut') mutate(range, expandedAtomicRange(root, range));
    }
  };
  const clicked = (event: MouseEvent): void => {
    if (disposed || event.defaultPrevented || composing || event.button !== 0 || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof view.Node)) return;
    const atom = atomicAncestor(root, target);
    if (!atom || !atomicFlow(root, atom)) return;
    const generation = revision;
    cancel(event);
    editor.focus();
    if (disposed || composing || generation !== revision || !focused() || !validAtomicMention(root, atom)) return;
    const range = document.createRange();
    range.selectNode(atom);
    const native = document.getSelection();
    if (native) setAtomicSelection(native, range);
  };
  const startComposition = (): void => { normalize(); composing = true; };
  const endComposition = (): void => { composing = false; normalize(); };
  const listen = (target: EventTarget, type: string, callback: EventListener): void => {
    target.addEventListener(type, callback, true);
    cleanups.push(() => target.removeEventListener(type, callback, true));
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const cleanup of [...cleanups.splice(0).reverse(), () => presentation.destroy()]) {
      try { cleanup(); }
      catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Atomic mention cleanup failed.');
  };
  try {
    listen(root, 'keydown', keydown as EventListener);
    listen(root, 'beforeinput', beforeinput as EventListener);
    listen(root, 'click', clicked as EventListener);
    listen(root, 'compositionstart', startComposition);
    listen(root, 'compositionend', endComposition);
    listen(document, 'selectionchange', normalize);
    cleanups.push(editor.onSelectionChange(normalize));
    cleanups.push(editor.events.on('readonlychange', () => { composing = false; normalize(); }));
    cleanups.push(editor.subscribe((change) => {
      revision++;
      if (change.source === 'api') composing = false;
      presentation.flush();
      normalize();
    }));
    normalize();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve setup failure after all owned cleanup attempts. */ }
    throw error;
  }
  return destroy;
};
