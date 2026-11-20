import type { Editor, EditorInputCommit } from '@morfira-dev/wysiwyg-core';
import { blockSelector, candidateAt, excluded, maximumURL, prefixAt, rangeAt } from './flow.js';
import type { CompletionCandidate } from './internal-types.js';

const caretAt = (root: HTMLElement): Range | undefined => {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  if (range.collapsed && root.contains(range.startContainer)) return range.cloneRange();
};
const blockAt = (root: HTMLElement, caret: Range): HTMLElement | undefined => {
  const node = caret.startContainer;
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  if (!element || element.closest(excluded)) return;
  const block = element.closest<HTMLElement>(blockSelector);
  if (block?.namespaceURI === 'http://www.w3.org/1999/xhtml' && root.contains(block)) return block;
};

/** Optional completion uses committed receipts, never a speculative change listener. */
export const installCompletion = (editor: Editor, enabled: () => boolean, email = false): (() => void) => {
  const root = editor.surface;
  let candidates = new WeakMap<Event, CompletionCandidate>();
  const available = () => enabled() && !editor.isReadOnly();
  const enter = (event: KeyboardEvent | InputEvent) => {
    if (!available() || !event.cancelable || event.defaultPrevented || event.isComposing) return;
    if (event instanceof KeyboardEvent) {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.keyCode === 229) return;
    }
    else if (event.inputType !== 'insertParagraph') return;
    const caret = caretAt(root);
    const block = caret && blockAt(root, caret);
    if (!caret || !block) return;
    const flow = prefixAt(block, caret);
    const candidate = candidateAt(flow.text, flow.truncated, false, email);
    const range = candidate && rangeAt(flow, candidate.start, candidate.length);
    if (!candidate || !range) return;
    candidates.set(event, { kind: 'enter', block, range, label: range.toString(), href: candidate.href });
  };
  const paste = (event: ClipboardEvent) => {
    if (!available() || !event.cancelable || event.defaultPrevented || !event.clipboardData || event.clipboardData.getData('text/html')) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text || text.length > maximumURL || /\s/.test(text)) return;
    const candidate = candidateAt(text, false, false, email);
    if (!candidate || candidate.start !== 0) return;
    const caret = caretAt(root);
    const block = caret && blockAt(root, caret);
    if (!block) return;
    candidates.set(event, { kind: 'paste', block, text, label: text.slice(0, candidate.length), href: candidate.href });
  };
  const complete = (receipt: EditorInputCommit) => {
    const candidate = candidates.get(receipt.sourceEvent);
    candidates.delete(receipt.sourceEvent);
    if (!candidate || !available() || !receipt.isCurrent()) return;
    if ((candidate.kind === 'enter') !== (receipt.inputType === 'insertParagraph')) return;
    const post = caretAt(root);
    if (!post || !root.contains(candidate.block)) return;
    let target: Range | undefined;
    if (candidate.kind === 'enter') {
      if (!candidate.block.contains(candidate.range.startContainer) || !candidate.block.contains(candidate.range.endContainer)
        || candidate.range.toString() !== candidate.label) return;
      const end = candidate.range.cloneRange();
      end.collapse(false);
      if (blockAt(root, end) !== candidate.block) return;
      const flow = prefixAt(candidate.block, end);
      if (!flow.text.endsWith(candidate.label)) return;
      target = rangeAt(flow, flow.text.length - candidate.label.length, candidate.label.length);
    }
    else {
      if (blockAt(root, post) !== candidate.block) return;
      const flow = prefixAt(candidate.block, post);
      if (!flow.text.endsWith(candidate.text)) return;
      target = rangeAt(flow, flow.text.length - candidate.text.length, candidate.label.length);
    }
    if (!target || target.toString() !== candidate.label) return;
    // A plain single-token paste is one text interval after core normalization.
    // Do not infer a restore point through unexpected inline structure.
    if (candidate.kind === 'paste' && target.startContainer !== target.endContainer) return;
    editor.transact(() => {
      if (!available() || !receipt.isCurrent()) return;
      const anchor = root.ownerDocument.createElement('a');
      anchor.setAttribute('href', candidate.href);
      anchor.append(target!.extractContents());
      target!.insertNode(anchor);
      const after = post.cloneRange();
      if (candidate.kind === 'paste') {
        const suffix = anchor.nextSibling;
        const punctuation = candidate.text.length - candidate.label.length;
        if (!suffix || suffix.nodeType !== 3 || suffix.textContent!.length < punctuation)
          throw new Error('Plain URL completion lost its trailing text boundary.');
        after.setStart(suffix, punctuation);
        after.collapse(true);
      }
      // HTML snapshots merge adjacent text and omit empty text nodes. Normalize
      // the touched container while the live caret Range follows those merges.
      anchor.parentNode?.normalize();
      const selection = root.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(after);
    });
  };
  const reset = () => { candidates = new WeakMap(); };
  const unsubscribe = editor.events.on('inputcommit', complete);
  const unchange = editor.subscribe((change) => { if (change.source === 'api') reset(); });
  const unreadonly = editor.events.on('readonlychange', (readOnly) => { if (readOnly) reset(); });
  root.addEventListener('keydown', enter, true);
  root.addEventListener('beforeinput', enter, true);
  root.addEventListener('paste', paste, true);
  root.addEventListener('compositionstart', reset);
  return () => {
    reset();
    unsubscribe();
    unchange();
    unreadonly();
    root.removeEventListener('keydown', enter, true);
    root.removeEventListener('beforeinput', enter, true);
    root.removeEventListener('paste', paste, true);
    root.removeEventListener('compositionstart', reset);
  };
};
