import type { Editor, EditorDocument } from '@morfira-dev/wysiwyg-core';
import type { TableSelectionReader } from '../../tables/internal-types.js';
import type { MentionClipboardCommands, MentionClipboardData, MentionClipboardInput } from '../types.js';
import { clipboardHTMLHasMention, parseClipboardData, selectedClipboardData, validateClipboardInput } from './clipboard-data.js';
import { clipboardLeaves } from './clipboard-source.js';
import { clipboardBlockPayload, editClipboardSelection } from './clipboard-edit.js';
import { atomicAncestor, atomicBoundary, atomicNativeSelection, atomicOffset, atomsInRange, expandedAtomicRange } from './selection.js';
import type { AtomicClipboardContext, AtomicClipboardSnapshot } from './types.js';

const controllers = new WeakMap<Editor, MentionClipboardCommands>();

export const mentionClipboardCommands = (editor: Editor): MentionClipboardCommands => {
  const controller = controllers.get(editor);
  if (!controller) throw new Error('Install atomic mentions first.');
  return controller;
};

/** No OS clipboard transport: native events and explicit application-owned buffers share one policy. */
export const setupAtomicClipboard = (editor: Editor, context: AtomicClipboardContext): (() => void) => {
  const root = editor.surface;
  const document = root.ownerDocument;
  let disposed = false;
  let domRevision = 0;
  const observer = new document.defaultView!.MutationObserver(() => { domRevision++; });
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
  const drain = (): number => {
    if (observer.takeRecords().length) domRevision++;
    return domRevision;
  };
  const ready = (): boolean => !disposed && context.ready();
  const tableOwnsClipboard = (): boolean => {
    const reader = editor.getPlugin<TableSelectionReader>('tables:selection');
    return !!reader?.()[0].some((cell) => root.contains(cell));
  };
  const snapshot = (): AtomicClipboardSnapshot | undefined => {
    if (!ready() || tableOwnsClipboard()) return;
    const selected = atomicNativeSelection(root);
    if (!selected) return;
    const original = selected.range;
    let range = original.collapsed ? original.cloneRange() : expandedAtomicRange(root, original);
    if (range.collapsed) {
      const atom = atomicAncestor(root, range.startContainer);
      if (atom) {
        const point = atomicBoundary(atom, atomicOffset(atom, range.startContainer, range.startOffset) * 2 >= atom.textContent!.length);
        range = document.createRange();
        range.setStart(point.node, point.offset);
        range.collapse(true);
      }
    }
    const leaves = clipboardLeaves(root, range);
    const flow = leaves?.[0];
    if (!flow || !leaves) return;
    return { flow, leaves, parent: flow.parentElement, range, backward: selected.backward,
      start: { node: original.startContainer, offset: original.startOffset },
      end: { node: original.endContainer, offset: original.endOffset },
      revision: context.revision(), domRevision: drain() };
  };
  const current = (plan: AtomicClipboardSnapshot): boolean => {
    if (!ready() || tableOwnsClipboard() || context.revision() !== plan.revision || drain() !== plan.domRevision || !root.contains(plan.flow)) return false;
    const selected = atomicNativeSelection(root);
    const leaves = clipboardLeaves(root, plan.range);
    return !!selected && selected.backward === plan.backward
      && selected.range.startContainer === plan.start.node && selected.range.startOffset === plan.start.offset
      && selected.range.endContainer === plan.end.node && selected.range.endOffset === plan.end.offset
      && root.contains(plan.start.node) && root.contains(plan.end.node) && plan.flow.parentElement === plan.parent
      && leaves?.length === plan.leaves.length && leaves.every((leaf, index) => leaf === plan.leaves[index]);
  };
  const copyPlan = (): { plan: AtomicClipboardSnapshot; data: MentionClipboardData } | undefined => {
    const plan = snapshot();
    if (!plan || plan.range.collapsed || !atomsInRange(root, plan.range).length) return;
    try {
      const data = selectedClipboardData(editor, plan.range, plan.leaves);
      return current(plan) ? { plan, data } : undefined;
    }
    catch { return undefined; }
  };
  const commit = (plan: AtomicClipboardSnapshot, value?: EditorDocument): boolean => {
    if (editor.isReadOnly() || !current(plan)) return false;
    if (clipboardBlockPayload(value) && !clipboardLeaves(root, plan.range, true)) return false;
    let changed = false;
    try {
      context.transact(() => {
        if (editor.isReadOnly() || !current(plan)) return;
        changed = editClipboardSelection(editor, plan, value);
      });
    }
    catch (error) {
      if (ready() && !editor.isReadOnly() && context.revision() === plan.revision) throw error;
      return false;
    }
    return changed;
  };
  const copy = (): MentionClipboardData | undefined => copyPlan()?.data;
  const cut = (): MentionClipboardData | undefined => {
    if (editor.isReadOnly()) return;
    const copied = copyPlan();
    return copied && commit(copied.plan) ? copied.data : undefined;
  };
  const paste = (input: MentionClipboardInput): boolean => {
    validateClipboardInput(input);
    if (!ready() || editor.isReadOnly()) return false;
    const plan = snapshot();
    if (!plan) return false;
    const value = parseClipboardData(editor, input);
    return !!value && commit(plan, value);
  };
  const commands: MentionClipboardCommands = { copy, cut, paste };
  const cancel = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const write = (event: ClipboardEvent): void => {
    if (!ready() || event.defaultPrevented || !event.cancelable || !event.clipboardData
      || event.clipboardData.files.length || [...event.clipboardData.items].some((item) => item.kind === 'file')) return;
    const cutting = event.type === 'cut';
    if (cutting && editor.isReadOnly()) return;
    const selected = atomicNativeSelection(root)?.range;
    if (!selected || selected.collapsed || !atomsInRange(root, expandedAtomicRange(root, selected)).length) return;
    // Own atom-touching events even when unsupported, preventing a partial native token cut.
    cancel(event);
    const copied = copyPlan();
    if (!copied) return;
    try {
      event.clipboardData.setData('text/html', copied.data.html);
      event.clipboardData.setData('text/plain', copied.data.text);
    }
    catch { return; }
    if (cutting) commit(copied.plan);
  };
  const pasted = (event: ClipboardEvent): void => {
    if (!ready() || event.defaultPrevented || !event.cancelable || !event.clipboardData
      || event.clipboardData.files.length || [...event.clipboardData.items].some((item) => item.kind === 'file')) return;
    if (tableOwnsClipboard()) return;
    const selected = atomicNativeSelection(root)?.range;
    if (!selected) return;
    const plan = snapshot();
    const touchesAtom = selected.collapsed ? !!atomicAncestor(root, selected.startContainer)
      : !!atomsInRange(root, expandedAtomicRange(root, selected)).length;
    const html = event.clipboardData.getData('text/html');
    if (!touchesAtom && !clipboardHTMLHasMention(root, html)) return;
    cancel(event);
    if (!plan || !current(plan) || editor.isReadOnly()) return;
    const text = event.clipboardData.getData('text/plain');
    if (!current(plan)) return;
    const value = parseClipboardData(editor, { html, text });
    if (value) commit(plan, value);
  };
  root.addEventListener('copy', write);
  root.addEventListener('cut', write);
  root.addEventListener('paste', pasted, true);
  controllers.set(editor, commands);
  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    root.removeEventListener('copy', write);
    root.removeEventListener('cut', write);
    root.removeEventListener('paste', pasted, true);
    if (controllers.get(editor) === commands) controllers.delete(editor);
  };
};
