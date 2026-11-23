import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';
import { textLayoutCommands } from '../../text-layout/index.js';
import { textLayoutUIMessages } from './messages.js';
import type { TextLayoutUIController } from './types.js';

export type { TextLayoutUIController } from './types.js';
export { textLayoutUIMessages } from './messages.js';

export const createTextLayoutUI = (host: HTMLElement, editor: Editor): TextLayoutUIController => {
  const commands = textLayoutCommands(editor);
  const root = editor.surface;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  if (!(host instanceof view.HTMLElement) || !host.isConnected || host.ownerDocument !== document || host.childNodes.length || root.contains(host) || host.contains(editor.element)) throw new TypeError('Text layout UI needs an empty connected external host.');
  const element = document.createElement('div');
  element.className = 'mw-text-layout';
  element.setAttribute('role', 'group');
  const rows = [
    { key: 'lineHeight' as const, mixed: 'lineHeightMixed' as const, message: 'ui.textLayout.lineHeight' as const, values: [1, 1.15, 1.5, 2, 2.5, 3], set: commands.setLineHeight },
    { key: 'spaceBefore' as const, mixed: 'spaceBeforeMixed' as const, message: 'ui.textLayout.before' as const, values: [0, 4, 8, 12, 16, 24, 32, 48], set: commands.setSpaceBefore },
    { key: 'spaceAfter' as const, mixed: 'spaceAfterMixed' as const, message: 'ui.textLayout.after' as const, values: [0, 4, 8, 12, 16, 24, 32, 48], set: commands.setSpaceAfter },
  ].map((row) => {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    const select = document.createElement('select');
    select.dataset.mwTextLayout = row.key;
    label.append(caption, select);
    element.append(label);
    return { ...row, caption, select };
  });
  let disposed = false;
  let pointerFocus = false;
  let handle: EditorSelectionHandle | undefined;
  const cleanups: (() => void)[] = [];
  const owned = (): boolean => host.isConnected && host.ownerDocument === document && host.contains(element) && !root.contains(host) && !host.contains(editor.element);
  const release = (): void => {
    if (handle) editor.selection.release(handle);
    handle = undefined;
  };
  const remember = (): void => {
    if (disposed || !owned()) return;
    release();
    handle = editor.selection.capture();
  };
  const restoreTarget = (): boolean => {
    if (!handle || !editor.selection.isCurrent(handle)) return false;
    const saved = editor.selection.getRange(handle);
    const selection = document.getSelection();
    const current = selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
    if (!saved) return false;
    if (current && root.contains(current.startContainer) && root.contains(current.endContainer)
      && (current.startContainer !== saved.startContainer || current.startOffset !== saved.startOffset
        || current.endContainer !== saved.endContainer || current.endOffset !== saved.endOffset)) return false;
    return editor.selection.restore(handle);
  };
  const refresh = (): void => {
    if (disposed) return;
    const state = commands.getState();
    const translate = (key: keyof typeof textLayoutUIMessages.en): string => localize(editor.getLocale(), key, textLayoutUIMessages);
    element.setAttribute('aria-label', translate('ui.textLayout.label'));
    for (const row of rows) {
      row.caption.textContent = translate(row.message);
      row.select.setAttribute('aria-label', row.caption.textContent);
      row.select.disabled = !owned() || state.disabled;
      row.select.replaceChildren();
      const add = (value: string, label: string, disabled = false): void => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.disabled = disabled;
        row.select.append(option);
      };
      add('', translate('ui.textLayout.reset'));
      for (const value of row.values) add(String(value), `${value}${row.key === 'lineHeight' ? '' : ' px'}`);
      if (state[row.mixed]) {
        add('mixed', translate('ui.textLayout.mixed'), true);
        row.select.value = 'mixed';
      }
      else if (state[row.key] !== false && !row.values.includes(state[row.key] as number)) {
        add('current', `${translate('ui.textLayout.custom')}: ${state[row.key]}${row.key === 'lineHeight' ? '' : ' px'}`, true);
        row.select.value = 'current';
      }
      else row.select.value = state[row.key] === false ? '' : String(state[row.key]);
    }
  };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    release();
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    element.remove();
  };
  const listen = (owner: EventTarget, name: string, callback: EventListener): void => {
    owner.addEventListener(name, callback);
    cleanups.push(() => owner.removeEventListener(name, callback));
  };
  try {
    for (const row of rows) {
      listen(row.select, 'pointerdown', () => { pointerFocus = true; remember(); });
      listen(row.select, 'pointerup', () => { pointerFocus = false; });
      listen(row.select, 'pointercancel', () => { pointerFocus = false; });
      listen(row.select, 'focus', () => {
        if (!pointerFocus) remember();
        pointerFocus = false;
      });
      listen(row.select, 'change', () => {
        const value = row.select.value;
        if (disposed || !owned() || !restoreTarget()) {
          refresh();
          return;
        }
        if (value === '' || row.values.includes(Number(value))) row.set(value === '' ? false : Number(value));
        release();
        refresh();
      });
    }
    cleanups.push(editor.onSelectionChange(refresh), editor.subscribe(refresh), editor.events.on('localechange', refresh), editor.events.on('readonlychange', refresh), editor.events.on('destroy', destroy));
    host.append(element);
    refresh();
  }
  catch (error) {
    destroy();
    throw error;
  }
  return { element, refresh, destroy };
};
