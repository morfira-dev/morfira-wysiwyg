import type { LocalizedToolbarAction, ToolbarAction, ToolbarOptions } from './types.js';
export type { ToolbarAction, ToolbarOptions } from './types.js';
import type { Editor } from '../../index.js';
import { inlineStyles, normalizeInlineStyle } from '../../formatting/inline-attributes.js';
import { bookmark, restoreBookmark } from '../../selection/index.js';
import type { SelectionBookmark } from '../../selection/index.js';
import { localize } from '../../localization/index.js';
import type { EditorLocale } from '../../localization/types.js';
import { toolbarMessages } from './messages.js';
const createDefaultActions = (): LocalizedToolbarAction[] => [
  { translationKey: 'toolbar.undo', label: toolbarMessages.ru['toolbar.undo'], text: '↶', run: (editor) => editor.undo(), enabled: (editor) => editor.canUndo() },
  { translationKey: 'toolbar.redo', label: toolbarMessages.ru['toolbar.redo'], text: '↷', run: (editor) => editor.redo(), enabled: (editor) => editor.canRedo() },
  { translationKey: 'toolbar.bold', label: toolbarMessages.ru['toolbar.bold'], text: 'B', format: 'bold' },
  { translationKey: 'toolbar.italic', label: toolbarMessages.ru['toolbar.italic'], text: 'I', format: 'italic' },
  { translationKey: 'toolbar.underline', label: toolbarMessages.ru['toolbar.underline'], text: 'U', format: 'underline' },
  { translationKey: 'toolbar.header', label: toolbarMessages.ru['toolbar.header'], text: 'H₂', format: 'header', value: 2 },
  { translationKey: 'toolbar.bulletList', label: toolbarMessages.ru['toolbar.bulletList'], text: '☷', format: 'list', value: 'bullet' },
  { translationKey: 'toolbar.orderedList', label: toolbarMessages.ru['toolbar.orderedList'], text: '1.', format: 'list', value: 'ordered' },
  { translationKey: 'toolbar.indent', label: toolbarMessages.ru['toolbar.indent'], text: '⇥', format: 'indent', value: 1, enabled: (editor) => Boolean(editor.getFormats().canIndent) },
  { translationKey: 'toolbar.outdent', label: toolbarMessages.ru['toolbar.outdent'], text: '⇤', format: 'indent', value: -1, enabled: (editor) => Boolean(editor.getFormats().canOutdent) },
  { translationKey: 'toolbar.blockquote', label: toolbarMessages.ru['toolbar.blockquote'], text: '❝', format: 'blockquote' },
  { translationKey: 'toolbar.clear', label: toolbarMessages.ru['toolbar.clear'], text: 'Tx', format: 'clear', enabled: (editor) => Boolean(editor.getSelection()?.length) },
];
export const createToolbar = (host: HTMLElement, editor: Editor, requestedActions?: ToolbarAction[], options: ToolbarOptions = {}): () => void => {
  const defaultActions = requestedActions === undefined ? createDefaultActions() : [];
  const defaultKeys = defaultActions.map((action) => action.translationKey);
  const actions = (requestedActions ?? defaultActions).map((action) => action.format && Object.hasOwn(inlineStyles, action.format) ? { ...action, value: normalizeInlineStyle(action.format, action.value) } : action);
  const toolbar = document.createElement('div');
  toolbar.className = 'mw-toolbar';
  toolbar.setAttribute('role', 'toolbar');
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
  const updateLocale = (state: EditorLocale = editor.getLocale()) => {
    if (disposed)
      return;
    toolbar.setAttribute('aria-label', options.label ?? localize(state, 'toolbar.label', toolbarMessages));
    buttons.forEach((button, index) => {
      const key = defaultKeys[index];
      const label = key ? localize(state, key, toolbarMessages) : actions[index].label;
      button.title = label;
      button.setAttribute('aria-label', label);
    });
  };
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
  const unlocale = editor.events.on('localechange', updateLocale);
  host.append(toolbar);
  updateLocale();
  update();
  return () => {
    if (disposed)
      return;
    disposed = true;
    unsubscribe();
    unselect();
    unlocale();
    toolbar.removeEventListener('keydown', keyboard);
    for (const dispose of cleanups)
      dispose();
    toolbar.remove();
  };
};
