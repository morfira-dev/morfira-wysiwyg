import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { applyRange, ordinaryLeaf, ownedRange, rootGap, selectedObject, supportedObject } from './targets.js';
import type { BlockNavigationCommands } from './types.js';

export const blockNavigation = (): EditorPlugin => ({
  name: 'block-navigation',
  setup: (editor) => {
    const root = editor.surface;
    const document = root.ownerDocument;
    let disposed = false;
    let composing = false;
    const available = (): boolean => !disposed && root.isConnected && !editor.isReadOnly() && !composing;
    const select = (target: HTMLElement): boolean => {
      if (!available() || !supportedObject(editor, target)) return false;
      const range = document.createRange();
      range.selectNode(target);
      applyRange(range);
      return selectedObject(editor) === target;
    };
    const placeGap = (index: number): void => {
      const range = document.createRange();
      range.setStart(root, index);
      range.collapse(true);
      applyRange(range);
    };
    const insertParagraph = (side: 'before' | 'after' = 'after', text = '', replace = false): boolean => {
      if (!available() || (side !== 'before' && side !== 'after')) return false;
      const range = ownedRange(root);
      if (!range) return false;
      const gap = rootGap(editor, range, side === 'before' ? -1 : 1);
      if (!gap || (!gap.selected && range.startContainer !== root)) return false;
      const handle = editor.selection.capture();
      if (!handle) return false;
      const selected = gap.selected;
      const index = replace && selected ? [...root.childNodes].indexOf(selected) : gap.index;
      const expected = { start: range.startContainer, startOffset: range.startOffset, end: range.endContainer, endOffset: range.endOffset };
      let inserted = false;
      try {
        editor.transact(() => {
          const current = ownedRange(root);
          if (!available() || !editor.selection.isCurrent(handle) || !current || current.startContainer !== expected.start || current.startOffset !== expected.startOffset
            || current.endContainer !== expected.end || current.endOffset !== expected.endOffset
            || (selected && !supportedObject(editor, selected))) return;
          const paragraph = document.createElement('p');
          paragraph.append(text ? document.createTextNode(text) : document.createElement('br'));
          root.insertBefore(paragraph, root.childNodes[index] ?? null);
          if (replace) selected?.remove();
          const caret = document.createRange();
          caret.selectNodeContents(paragraph);
          if (text) caret.setStart(paragraph.firstChild!, text.length);
          caret.collapse(true);
          applyRange(caret);
          inserted = true;
        });
      }
      finally {
        editor.selection.release(handle);
      }
      return inserted;
    };
    const removeSelected = (): boolean => {
      const target = selectedObject(editor);
      if (!available() || !target) return false;
      let removed = false;
      editor.transact(() => {
        if (!available() || selectedObject(editor) !== target || !supportedObject(editor, target)) return;
        const index = [...root.childNodes].indexOf(target);
        target.remove();
        if (!root.childNodes.length) {
          const paragraph = document.createElement('p');
          paragraph.append(document.createElement('br'));
          root.append(paragraph);
          const caret = document.createRange();
          caret.setStart(paragraph, 0);
          caret.collapse(true);
          applyRange(caret);
        }
        else placeGap(Math.min(index, root.childNodes.length));
        removed = true;
      });
      return removed;
    };
    const claim = (event: Event): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const keydown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !event.cancelable || !available() || event.isComposing
        || event.altKey || event.ctrlKey || event.metaKey || (event.shiftKey && event.key !== 'Enter')) return;
      const range = ownedRange(root);
      if (!range) return;
      const selected = selectedObject(editor, range);
      if (event.key === 'Enter') {
        if (insertParagraph(event.shiftKey ? 'before' : 'after')) claim(event);
        return;
      }
      const backwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Backspace';
      const forwards = event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'Delete';
      if (!backwards && !forwards) return;
      const direction = backwards ? -1 : 1;
      const deleting = event.key === 'Backspace' || event.key === 'Delete';
      if (selected && deleting) {
        if (removeSelected()) claim(event);
        return;
      }
      // Vertical movement inside text retains browser visual-line navigation.
      if (!selected && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) return;
      const gap = rootGap(editor, range, direction);
      if (!gap) return;
      if (selected) {
        placeGap(gap.index);
        claim(event);
        return;
      }
      const neighbour = root.childNodes[gap.index + (direction === -1 ? -1 : 0)];
      if (supportedObject(editor, neighbour)) {
        if (select(neighbour)) claim(event);
        return;
      }
      if (deleting || range.startContainer !== root) return;
      const leaf = ordinaryLeaf(root, neighbour ?? null);
      if (!leaf || leaf !== neighbour) return;
      const caret = document.createRange();
      caret.selectNodeContents(leaf);
      caret.collapse(direction === 1);
      applyRange(caret);
      claim(event);
    };
    const beforeinput = (event: InputEvent): void => {
      if (event.defaultPrevented || !event.cancelable || !available() || event.isComposing) return;
      if (event.inputType === 'insertParagraph') {
        if (insertParagraph()) claim(event);
      }
      else if (event.inputType === 'insertText' && event.data && !/[\u0000-\u001f\u007f]/.test(event.data)) {
        if (insertParagraph('after', event.data, true)) claim(event);
      }
      else if ((event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') && selectedObject(editor)) {
        if (removeSelected()) claim(event);
      }
    };
    const compositionStart = (): void => { composing = true; };
    const compositionEnd = (): void => { composing = false; };
    const api: BlockNavigationCommands = {
      getSelected: () => disposed ? undefined : selectedObject(editor),
      select,
      insertParagraph: (side) => insertParagraph(side),
    };
    const unprovide = editor.providePlugin('block-navigation', api);
    // These notifications follow explicit core composition cancellation.
    const unsubscribe = editor.subscribe((change) => {
      if (change.source === 'api') composing = false;
    });
    const unreadonly = editor.events.on('readonlychange', (readOnly) => {
      if (readOnly) composing = false;
    });
    root.addEventListener('keydown', keydown, true);
    root.addEventListener('beforeinput', beforeinput, true);
    root.addEventListener('compositionstart', compositionStart, true);
    root.addEventListener('compositionend', compositionEnd, true);
    return () => {
      if (disposed) return;
      disposed = true;
      unprovide();
      unsubscribe();
      unreadonly();
      root.removeEventListener('keydown', keydown, true);
      root.removeEventListener('beforeinput', beforeinput, true);
      root.removeEventListener('compositionstart', compositionStart, true);
      root.removeEventListener('compositionend', compositionEnd, true);
    };
  },
});

export const blockNavigationCommands = (editor: Editor): BlockNavigationCommands => {
  const commands = editor.getPlugin<BlockNavigationCommands>('block-navigation');
  if (!commands) throw new Error('Block navigation plugin is not installed.');
  return commands;
};
