import type { ToolbarAction, ToolbarOptions } from './types.js';
export type { ToolbarAction, ToolbarOptions } from './types.js';
import type { Editor } from '../../index.js';
import { inlineStyles, normalizeInlineStyle } from '../../formatting/inline-attributes.js';
import { bookmark, restoreBookmark } from '../../selection/index.js';
import type { SelectionBookmark } from '../../selection/index.js';
const defaultActions: ToolbarAction[] = [
  { label: 'Отменить', text: '↶', run: (editor) => editor.undo(), enabled: (editor) => editor.canUndo() },
  { label: 'Повторить', text: '↷', run: (editor) => editor.redo(), enabled: (editor) => editor.canRedo() },
  { label: 'Полужирный', text: 'B', format: 'bold' },
  { label: 'Курсив', text: 'I', format: 'italic' },
  { label: 'Подчёркнутый', text: 'U', format: 'underline' },
  { label: 'Заголовок', text: 'H₂', format: 'header', value: 2 },
  { label: 'Маркированный список', text: '☷', format: 'list', value: 'bullet' },
  { label: 'Нумерованный список', text: '1.', format: 'list', value: 'ordered' },
  { label: 'Увеличить отступ', text: '⇥', format: 'indent', value: 1, enabled: (editor) => Boolean(editor.getFormats().canIndent) },
  { label: 'Уменьшить отступ', text: '⇤', format: 'indent', value: -1, enabled: (editor) => Boolean(editor.getFormats().canOutdent) },
  { label: 'Цитата', text: '❝', format: 'blockquote' },
  { label: 'Очистить форматирование', text: 'Tx', format: 'clear', enabled: (editor) => Boolean(editor.getSelection()?.length) },
];
export const createToolbar = (host: HTMLElement, editor: Editor, actions = defaultActions, options: ToolbarOptions = {}): () => void => {
  actions = actions.map((action) => action.format && Object.hasOwn(inlineStyles, action.format) ? { ...action, value: normalizeInlineStyle(action.format, action.value) } : action);
  const toolbar = document.createElement('div');
  toolbar.className = 'mw-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', options.label ?? 'Форматирование');
  let saved: SelectionBookmark | undefined;
  let disposed = false;
  let tabIndex = 0;
  const cleanups: (() => void)[] = [];
  const buttons = actions.map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.text;
    button.title = action.label;
    button.setAttribute('aria-label', action.label);
    const down = (event: MouseEvent) => event.preventDefault();
    const click = () => {
      if (disposed || button.disabled || editor.isReadOnly())
        return;
      editor.focus();
      if (saved)
        restoreBookmark(editor.surface, saved);
      if (action.enabled && !action.enabled(editor))
        return;
      if (action.run)
        action.run(editor);
      else if (action.format) {
        const formats = editor.getFormats();
        const mixed = (formats.mixed as string[] | undefined)?.includes(action.format);
        editor.format(action.format, !mixed && formats[action.format] === (action.value ?? true) ? false : action.value ?? true);
      }
      update();
    };
    button.addEventListener('mousedown', down);
    button.addEventListener('click', click);
    cleanups.push(() => { button.removeEventListener('mousedown', down); button.removeEventListener('click', click); });
    toolbar.append(button);
    return button;
  });
  const update = () => {
    if (disposed)
      return;
    saved = bookmark(editor.surface) ?? saved;
    const formats = editor.getFormats();
    buttons.forEach((button, index) => {
      const action = actions[index];
      button.disabled = editor.isReadOnly() || (action.enabled ? !action.enabled(editor) : false);
      if (action.format && !['indent', 'clear'].includes(action.format))
        button.setAttribute('aria-pressed', (formats.mixed as string[] | undefined)?.includes(action.format) ? 'mixed' : String(formats[action.format] === (action.value ?? true)));
    });
    if (buttons[tabIndex]?.disabled || !buttons[tabIndex])
      tabIndex = buttons.findIndex((button) => !button.disabled);
    buttons.forEach((button, index) => { button.tabIndex = index === tabIndex ? 0 : -1; });
  };
  const keyboard = (event: KeyboardEvent) => {
    const enabled = buttons.filter((button) => !button.disabled);
    if (!enabled.length)
      return;
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.focus();
      if (saved)
        restoreBookmark(editor.surface, saved);
      return;
    }
    const direction = getComputedStyle(toolbar).direction === 'rtl' ? -1 : 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : event.key === 'ArrowRight' ? (index + direction + enabled.length) % enabled.length : event.key === 'ArrowLeft' ? (index - direction + enabled.length) % enabled.length : -1;
    if (next >= 0) {
      event.preventDefault();
      tabIndex = buttons.indexOf(enabled[next]);
      update();
      enabled[next].focus();
    }
  };
  toolbar.addEventListener('keydown', keyboard);
  const unsubscribe = editor.subscribe((change) => {
    if (change.source === 'api')
      saved = undefined; update();
  });
  const unselect = editor.onSelectionChange(update);
  host.append(toolbar);
  update();
  return () => {
    if (disposed)
      return; disposed = true; unsubscribe(); unselect(); toolbar.removeEventListener('keydown', keyboard); for (const dispose of cleanups)
      dispose(); toolbar.remove();
  };
};
