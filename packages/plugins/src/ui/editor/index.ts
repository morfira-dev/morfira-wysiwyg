import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createFormSelection } from '../shared/selection.js';
import { createEditorUIIcon } from './icons.js';
import { editorUIMessages } from './messages.js';
import type { EditorUIControl } from './internal-types.js';
import type { EditorUIAction, EditorUIBuiltin, EditorUIController, EditorUIItem, EditorUIMessageKey, EditorUIOptions } from './types.js';

export { editorUIMessages } from './messages.js';
export type { EditorUIAction, EditorUIBuiltin, EditorUIController, EditorUIIcon, EditorUIItem, EditorUIMessageKey, EditorUIOptions } from './types.js';

const builtins: readonly EditorUIBuiltin[] = ['undo', 'redo', 'bold', 'italic', 'underline', 'strike', 'code', 'subscript', 'superscript', 'blockquote', 'clear', 'indent', 'outdent', 'block', 'list', 'align', 'color', 'background'];
export const createDefaultEditorUIGroups = (): EditorUIItem[][] => [
  ['undo', 'redo'],
  ['bold', 'italic', 'underline', 'strike', 'code', 'subscript', 'superscript'],
  ['block', 'list', 'align'],
  ['blockquote', 'indent', 'outdent', 'clear'],
  ['color', 'background'],
];
const keyFor = (builtin: EditorUIBuiltin): EditorUIMessageKey => `ui.editor.${builtin}`;
const validateGroups = (options: EditorUIOptions): EditorUIItem[][] => {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Expected editor UI options.');
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('Editor UI label must be a string.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('Editor UI onError must be a function.');
  if (options.density !== undefined && !['comfortable', 'compact'].includes(options.density)) throw new TypeError('Invalid editor UI density.');
  const requested = options.groups ?? createDefaultEditorUIGroups();
  if (!Array.isArray(requested) || !requested.length || requested.length > 32) throw new TypeError('Expected 1–32 editor UI groups.');
  const ids = new Set<string>();
  return requested.map((group) => {
    if (!Array.isArray(group) || !group.length || group.length > 64) throw new TypeError('Editor UI groups must contain 1–64 items.');
    return group.map((item: EditorUIItem) => {
      if (typeof item === 'string') {
        if (!builtins.includes(item)) throw new TypeError('Unknown built-in editor UI control.');
      }
      else {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-z][a-z0-9:-]{0,99}$/.test(item.id) || builtins.includes(item.id as EditorUIBuiltin)) throw new TypeError('Expected a unique custom editor UI action.');
        if (typeof item.label !== 'string' && typeof item.label !== 'function') throw new TypeError('Action label must be text or a reader.');
        if (typeof item.run !== 'function' || item.run.constructor.name === 'AsyncFunction') throw new TypeError('Action must execute synchronously.');
        for (const callback of [item.enabled, item.pressed, typeof item.label === 'function' ? item.label : undefined]) {
          if (callback !== undefined && (typeof callback !== 'function' || callback.constructor.name === 'AsyncFunction')) throw new TypeError('Action state readers must be synchronous.');
        }
        if (item.mutates !== undefined && typeof item.mutates !== 'boolean') throw new TypeError('Action mutates must be boolean.');
        if (item.icon !== undefined && ![...builtins, 'link', 'image', 'search', 'table'].includes(item.icon)) throw new TypeError('Unknown editor UI icon.');
        if (item.text !== undefined && typeof item.text !== 'string') throw new TypeError('Action text must be a string.');
      }
      const id = typeof item === 'string' ? item : item.id;
      const selected = [id, ...(id === 'color' || id === 'background' ? [`${id}-reset`] : [])];
      for (const value of selected) {
        if (ids.has(value)) throw new Error(`Duplicate editor UI control: ${value}`);
        ids.add(value);
      }
      return typeof item === 'string' ? item : { ...item };
    });
  });
};
const colorValue = (value: unknown): string => {
  if (typeof value !== 'string') return '#000000';
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  if (/^#[\da-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map((part) => part + part).join('');
  const rgb = /^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i.exec(value);
  return rgb ? '#' + rgb.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('') : '#000000';
};

export const createEditorUI = (host: HTMLElement, editor: Editor, options: EditorUIOptions = {}): EditorUIController => {
  editor.getLocale();
  if (host.childNodes.length || editor.surface.contains(host) || host.ownerDocument !== editor.surface.ownerDocument) throw new Error('Editor UI needs an empty external host in the editor document.');
  const groups = validateGroups(options);
  const explicitLabel = options.label;
  const diagnostics = options.onError;
  const document = host.ownerDocument;
  const element = document.createElement('section');
  element.className = 'mw-editor-ui';
  element.dataset.density = options.density ?? 'comfortable';
  const toolbar = document.createElement('div');
  toolbar.className = 'mw-editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  const status = document.createElement('p');
  status.className = 'mw-ui-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const controls: EditorUIControl[] = [];
  const cleanups: (() => void)[] = [];
  const selection = createFormSelection(editor);
  let disposed = false;
  let composing = false;
  let focused = 0;
  let statusKey: EditorUIMessageKey | undefined;
  const message = (key: EditorUIMessageKey) => localize(editor.getLocale(), key, editorUIMessages);
  const report = (error: unknown, key: EditorUIMessageKey = 'ui.editor.error') => {
    statusKey = key;
    status.textContent = message(key);
    try { diagnostics?.(error); }
    catch { /* Diagnostics cannot break UI cleanup or committed document changes. */ }
  };
  const labelFor = (action: EditorUIAction): string => {
    const label = typeof action.label === 'function' ? action.label(editor) : action.label;
    if (typeof label !== 'string') throw new TypeError('Action label reader must return text.');
    return label;
  };
  const updateTabs = () => {
    const active = controls.findIndex((control) => control.element === document.activeElement);
    if (active >= 0 && !controls[active].element.disabled) focused = active;
    if (!controls[focused] || controls[focused].element.disabled) focused = controls.findIndex((control) => !control.element.disabled);
    controls.forEach((control, index) => { control.element.tabIndex = index === focused ? 0 : -1; });
    toolbar.tabIndex = focused < 0 ? 0 : -1;
  };
  const refresh = () => {
    if (disposed) return;
    const formats = editor.getFormats();
    const mixed = formats.mixed as string[] | undefined;
    const readOnly = editor.isReadOnly();
    toolbar.setAttribute('aria-label', explicitLabel ?? message('ui.editor.label'));
    toolbar.title = message('ui.editor.keyboard');
    for (const control of controls) {
      const node = control.element;
      try {
        const label = control.action ? labelFor(control.action) : message(control.labelKey ?? keyFor(control.builtin!));
        node.setAttribute('aria-label', label);
        node.title = label;
        if (control.action) {
          const action = control.action;
          const enabled = action.enabled ? action.enabled(editor) : true;
          if (typeof enabled !== 'boolean') throw new TypeError('Action enabled reader must return a boolean.');
          node.disabled = (action.mutates !== false && (readOnly || composing)) || !enabled;
          if (action.pressed) {
            const pressed = action.pressed(editor);
            if (typeof pressed !== 'boolean' && pressed !== 'mixed') throw new TypeError('Action pressed reader must return boolean or mixed.');
            node.setAttribute('aria-pressed', String(pressed));
          }
          if (!action.icon) node.textContent = action.text ?? label;
          continue;
        }
        const id = control.builtin!;
        node.disabled = readOnly || composing || (id === 'undo' ? !editor.canUndo() : id === 'redo' ? !editor.canRedo() : id === 'clear' ? !editor.getSelection()?.length : id === 'indent' ? !formats.canIndent : id === 'outdent' ? !formats.canOutdent : false);
        if (control.options) {
          [...(node as HTMLSelectElement).options].forEach((option, index) => { option.textContent = message(control.options![index].key); });
          const property = id === 'block' ? 'header' : id;
          (node as HTMLSelectElement).value = mixed?.includes(property) ? 'mixed' : String(id === 'block' && formats['code-block'] ? 'code-block' : formats[property] ?? (id === 'block' ? 0 : id === 'align' ? 'left' : ''));
        }
        else if (node instanceof HTMLInputElement) {
          node.value = colorValue(formats[id]);
          node.dataset.mixed = String(Boolean(mixed?.includes(id)));
        }
        else if (control.reset) node.disabled = readOnly || composing || (!formats[id] && !mixed?.includes(id));
        else if (!['undo', 'redo', 'clear', 'indent', 'outdent'].includes(id)) node.setAttribute('aria-pressed', mixed?.includes(id) ? 'mixed' : String(Boolean(formats[id])));
      }
      catch (error) {
        node.disabled = true;
        report(error);
      }
    }
    status.textContent = statusKey ? message(statusKey) : '';
    updateTabs();
  };
  const activate = (control: EditorUIControl) => {
    if (disposed || control.element.disabled) return;
    focused = controls.indexOf(control);
    const mutates = control.action?.mutates !== false;
    const chosen = control.element instanceof HTMLInputElement || control.element instanceof HTMLSelectElement ? control.element.value : undefined;
    if (mutates && (editor.isReadOnly() || composing)) return;
    try {
      statusKey = undefined;
      if (control.action?.enabled && !control.action.enabled(editor)) return;
      if (mutates && !selection.restore()) {
        report(new Error('Editor selection is no longer available.'), 'ui.editor.selection');
        return;
      }
      if (control.action) {
        if (mutates) editor.transact(() => control.action!.run(editor));
        else {
          const result: unknown = control.action.run(editor);
          if (result && (typeof result === 'object' || typeof result === 'function') && typeof (result as { then?: unknown }).then === 'function') {
            if (result instanceof Promise) void result.catch(() => {});
            throw new TypeError('UI actions must finish synchronously.');
          }
        }
      }
      else {
        const id = control.builtin!;
        if (id === 'undo') editor.undo();
        else if (id === 'redo') editor.redo();
        else if (control.options) {
          const value = chosen!;
          if (value !== 'mixed') {
            if (id === 'block' && value === 'code-block') editor.format('code-block', true);
            else editor.format(id === 'block' ? 'header' : id, id === 'block' ? Number(value) || false : id === 'list' ? value || false : value);
          }
        }
        else if (id === 'color' || id === 'background') editor.format(id, control.reset ? false : chosen!);
        else if (id === 'indent' || id === 'outdent') editor.format('indent', id === 'indent' ? 1 : -1);
        else if (id === 'clear') editor.format('clear', true);
        else {
          const formats = editor.getFormats();
          editor.format(id, (formats.mixed as string[] | undefined)?.includes(id) || !formats[id]);
        }
      }
      refresh();
    }
    catch (error) { report(error); }
  };
  const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, callback: (event: HTMLElementEventMap[K]) => void) => {
    target.addEventListener(type, callback);
    cleanups.push(() => target.removeEventListener(type, callback));
  };
  const button = (group: HTMLElement, control: Omit<EditorUIControl, 'element'>) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'mw-ui-button';
    const icon = createEditorUIIcon(document, control.action?.icon ?? control.builtin!);
    if (icon) node.append(icon);
    else node.textContent = control.action?.text ?? '↺';
    node.dataset.mwUiAction = control.id;
    const complete = { ...control, element: node };
    controls.push(complete);
    listen(node, 'pointerdown', (event) => { selection.capture(); event.preventDefault(); });
    listen(node, 'click', () => activate(complete));
    group.append(node);
  };
  const selectOptions = (id: EditorUIBuiltin): readonly { value: string; key: EditorUIMessageKey }[] => [
    { value: 'mixed', key: 'ui.editor.mixed' },
    ...(id === 'block' ? [{ value: '0', key: 'ui.editor.paragraph' }, ...[1, 2, 3, 4, 5, 6].map((level) => ({ value: String(level), key: `ui.editor.h${level}` as EditorUIMessageKey })), { value: 'code-block', key: 'ui.editor.codeBlock' }]
      : id === 'list' ? [{ value: '', key: 'ui.editor.none' }, { value: 'bullet', key: 'ui.editor.bullet' }, { value: 'ordered', key: 'ui.editor.ordered' }]
        : ['left', 'center', 'right', 'justify'].map((value) => ({ value, key: `ui.editor.${value}` as EditorUIMessageKey }))),
  ] as readonly { value: string; key: EditorUIMessageKey }[];
  const keyboard = (event: KeyboardEvent) => {
    if (disposed || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!selection.restore()) editor.focus();
      return;
    }
    const current = controls.findIndex((control) => control.element === event.target);
    if (current < 0 || event.ctrlKey || event.metaKey) return;
    const native = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
    if (native && !event.altKey) return;
    if (event.altKey && !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const enabled = controls.filter((control) => !control.element.disabled);
    const position = enabled.indexOf(controls[current]);
    const direction = getComputedStyle(toolbar).direction === 'rtl' ? -1 : 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : event.key === 'ArrowRight' ? (position + direction + enabled.length) % enabled.length : event.key === 'ArrowLeft' ? (position - direction + enabled.length) % enabled.length : -1;
    if (next < 0 || !enabled.length) return;
    event.preventDefault();
    focused = controls.indexOf(enabled[next]);
    enabled[next].element.focus();
    updateTabs();
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.reverse()) cleanup();
    selection.destroy();
    element.remove();
  };
  try {
    for (const items of groups) {
      const group = document.createElement('div');
      group.className = 'mw-ui-group';
      for (const item of items) {
        if (typeof item !== 'string') {
          button(group, { id: item.id, action: item });
          continue;
        }
        if (['block', 'list', 'align'].includes(item)) {
          const node = document.createElement('select');
          node.className = 'mw-ui-select';
          node.dataset.mwUiAction = item;
          const choices = selectOptions(item);
          for (const choice of choices) {
            const option = document.createElement('option');
            option.value = choice.value;
            option.disabled = choice.value === 'mixed';
            node.append(option);
          }
          const control = { id: item, builtin: item, element: node, options: choices };
          controls.push(control);
          listen(node, 'pointerdown', () => selection.capture());
          listen(node, 'change', () => activate(control));
          group.append(node);
        }
        else if (item === 'color' || item === 'background') {
          const node = document.createElement('input');
          node.type = 'color';
          node.className = 'mw-ui-color';
          node.dataset.mwUiAction = item;
          const control = { id: item, builtin: item, element: node };
          controls.push(control);
          listen(node, 'pointerdown', () => selection.capture());
          listen(node, 'change', () => activate(control));
          group.append(node);
          button(group, { id: `${item}-reset`, builtin: item, reset: true, labelKey: item === 'color' ? 'ui.editor.colorReset' : 'ui.editor.backgroundReset' });
        }
        else button(group, { id: item, builtin: item });
      }
      toolbar.append(group);
    }
    element.append(toolbar, status);
    listen(toolbar, 'keydown', keyboard);
    listen(editor.surface, 'compositionstart', () => { composing = true; refresh(); });
    listen(editor.surface, 'compositionend', () => { composing = false; refresh(); });
    cleanups.push(editor.subscribe(refresh), editor.onSelectionChange(refresh), editor.events.on('localechange', refresh), editor.events.on('readonlychange', refresh), editor.events.on('destroy', destroy));
    host.append(element);
    refresh();
  }
  catch (error) {
    destroy();
    throw error;
  }
  return { element, refresh: () => { if (disposed) throw new Error('Editor UI has been destroyed.'); refresh(); }, destroy };
};
