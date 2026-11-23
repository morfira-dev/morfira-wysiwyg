import type { Editor, StructuralMappingStep } from '@morfira-dev/wysiwyg-core';
import { copyStructuralSteps } from './copy.js';
import type { StructuralCommands } from './types.js';
export type { StructuralCommands } from './types.js';

const at = (root: HTMLElement, path: readonly number[]): HTMLElement => {
  let node = root;
  for (const index of path) {
    const child = node.children[index];
    if (!(child instanceof root.ownerDocument.defaultView!.HTMLElement)) throw new RangeError('Structural DOM path does not exist.');
    node = child;
  }
  return node;
};
const ordinaryText = (node: HTMLElement): string => {
  if (!/^(?:p|h[1-6])$/.test(node.localName) || node.hasAttribute('data-mw-node')
    || [...node.childNodes].some((child) => child.nodeType !== 3 && !(node.childNodes.length === 1 && child.nodeType === 1 && (child as Element).localName === 'br')))
    throw new TypeError('Structural split/join requires an ordinary text-only DOM leaf.');
  return node.textContent ?? '';
};
const setText = (node: HTMLElement, text: string): void => {
  node.replaceChildren(text ? node.ownerDocument.createTextNode(text) : node.ownerDocument.createElement('br'));
};
const caret = (root: HTMLElement, node: HTMLElement | undefined, offset?: number): void => {
  const range = root.ownerDocument.createRange();
  if (node && root.contains(node) && offset !== undefined) {
    range.setStart(node.firstChild?.nodeType === 3 ? node.firstChild : node, offset);
  }
  else if (node && root.contains(node)) range.setStartAfter(node);
  else range.setStart(root, 0);
  range.collapse(true);
  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

export const structuralCommands = (editor: Editor): StructuralCommands => ({
  apply: (input) => {
    if (editor.isReadOnly()) return false;
    const steps = copyStructuralSteps(editor, input);
    const handle = editor.selection.capture();
    const saved = handle && editor.selection.getRange(handle);
    if (!handle || !saved) return false;
    const root = editor.surface;
    const before = editor.getHTML();
    let changed = false;
    const stale = new Error('Structural target became stale during focus.');
    const currentIntent = (): boolean => {
      if (!editor.selection.isCurrent(handle)) return false;
      const current = root.ownerDocument.getSelection();
      const range = current?.rangeCount === 1 ? current.getRangeAt(0) : undefined;
      return Boolean(range && editor.getHTML() === before && range.startContainer === saved.startContainer && range.startOffset === saved.startOffset
        && range.endContainer === saved.endContainer && range.endOffset === saved.endOffset);
    };
    try {
      editor.focus();
      if (!currentIntent() || editor.isReadOnly()) return false;
      editor.transact(() => {
        const selection = root.ownerDocument.getSelection();
        const range = selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
        if (!currentIntent() || !range) throw stale;
        const anchor = selection!.anchorNode;
        const focus = selection!.focusNode;
        const anchorOffset = selection!.anchorOffset;
        const focusOffset = selection!.focusOffset;
        let result: HTMLElement | undefined;
        let offset: number | undefined;
        for (const step of steps) {
          if (step.kind === 'insert') {
            const parent = at(root, step.parent);
            const reference = parent.children[step.index] ?? null;
            const fragment = editor.schema.renderDocument({ version: 1, children: [...step.nodes] });
            result = fragment.lastElementChild as HTMLElement | undefined;
            parent.insertBefore(fragment, reference);
            offset = undefined;
            continue;
          }
          const target = at(root, step.path);
          if (step.kind === 'split') {
            const text = ordinaryText(target);
            const model = editor.schema.parseHTML(target.outerHTML).children[0];
            if (!model || model.type !== 'element') throw new TypeError('Unsupported split target.');
            model.children = text.slice(step.offset) ? [{ type: 'text', text: text.slice(step.offset) }]
              : [{ type: 'element', tag: 'br', attributes: {}, children: [] }];
            const right = editor.schema.renderDocument({ version: 1, children: [model] }).firstElementChild as HTMLElement;
            setText(target, text.slice(0, step.offset));
            target.after(right);
            result = right;
            offset = 0;
          }
          else if (step.kind === 'join') {
            const right = target.nextSibling;
            if (!right || right.nodeType !== 1) throw new TypeError('Join requires adjacent DOM leaves.');
            const left = ordinaryText(target);
            setText(target, left + ordinaryText(right as HTMLElement));
            right.remove();
            result = target;
            offset = left.length;
          }
          else if (step.kind === 'remove') {
            const preceding = target.previousElementSibling as HTMLElement | null;
            target.remove();
            result = preceding ?? undefined;
            offset = undefined;
          }
          else {
            target.remove();
            const parent = at(root, step.parent);
            parent.insertBefore(target, parent.children[step.index] ?? null);
            result = target;
            offset = undefined;
          }
        }
        if (anchor?.nodeType === 3 && focus?.nodeType === 3 && root.contains(anchor) && root.contains(focus)
          && anchorOffset <= (anchor.textContent?.length ?? 0) && focusOffset <= (focus.textContent?.length ?? 0))
          selection!.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
        else caret(root, result, offset);
        changed = editor.getHTML() !== before;
      }, { structuralMapping: steps });
      return changed;
    }
    catch (error) {
      if (error === stale) return false;
      throw error;
    }
    finally { editor.selection.release(handle); }
  },
});
