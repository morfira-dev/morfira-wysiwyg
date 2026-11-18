import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { tablePropertyCommands } from '../../table-properties/index.js';
import { tablePropertyTarget, sameTablePropertyTarget } from '../../table-properties/target.js';
import { tableCommands, tableSelectionChange } from '../../tables/index.js';
import { createFormSelection } from '../shared/selection.js';
import { createUIButton, createUIElement, createUIStatus } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import { ordinaryTableRange } from '../shared/table-selection.js';
import { tablePropertiesFormMessages } from './messages.js';
import { checkedFormValues, propertyFields, propertyPatch } from './values.js';
import type { TablePropertiesFormControl, TablePropertiesFormTarget } from './internal-types.js';
import type { TablePropertiesFormController, TablePropertiesFormField, TablePropertiesFormMessageKey, TablePropertiesFormOptions, TablePropertiesFormValues } from './types.js';

export const createTablePropertiesForm = (host: HTMLElement, editor: Editor, options: TablePropertiesFormOptions = {}): TablePropertiesFormController => {
  editor.getLocale();
  const api = tablePropertyCommands(editor);
  const tables = tableCommands(editor);
  const surface = editor.surface;
  const document = surface.ownerDocument;
  if (!host.isConnected || host.ownerDocument !== document || host.childNodes.length || surface.contains(host)
    || host.contains(editor.element) || host.namespaceURI !== 'http://www.w3.org/1999/xhtml')
    throw new TypeError('Mount table properties into an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(options)) || Reflect.ownKeys(options).some((key) => key !== 'label' && key !== 'onError')
    || (options.label !== undefined && typeof options.label !== 'string') || (options.onError !== undefined && typeof options.onError !== 'function'))
    throw new TypeError('Expected a table properties label and optional error callback.');
  const label = options.label;
  const onError = options.onError;
  const form = createUIElement(document, 'section', 'mw-form mw-table-properties-form');
  form.setAttribute('role', 'form');
  const fieldset = createUIElement(document, 'fieldset');
  const controls: TablePropertiesFormControl[] = propertyFields.map((key) => {
    const field = createUIElement(document, 'label');
    const caption = createUIElement(document, 'span');
    const choice = key === 'alignment' ? ['reset', 'left', 'center', 'right']
      : key === 'cellVerticalAlign' ? ['reset', 'top', 'middle', 'bottom']
        : key === 'headerRow' || key === 'headerColumn' ? ['off', 'on'] : undefined;
    const input = choice ? createUIElement(document, 'select')
      : key === 'caption' ? createUIElement(document, 'textarea') : createUIElement(document, 'input');
    if (input instanceof document.defaultView!.HTMLInputElement) input.maxLength = 100;
    if (input instanceof document.defaultView!.HTMLTextAreaElement) { input.maxLength = 5000; input.rows = 2; }
    if (choice) {
      const mixed = createUIElement(document, 'option');
      mixed.value = '__mixed';
      mixed.disabled = true;
      mixed.hidden = true;
      mixed.dataset.mwPropertyLabel = 'mixed';
      input.append(mixed);
      for (const value of choice) {
        const option = createUIElement(document, 'option');
        option.value = value === 'reset' || value === 'off' ? '' : value === 'on' ? 'true' : value;
        option.dataset.mwPropertyLabel = value;
        input.append(option);
      }
    }
    input.dataset.mwTableProperty = key;
    field.append(caption, input);
    fieldset.append(field);
    return { key, caption, input };
  });
  const apply = createUIButton(document);
  const status = createUIStatus(document, 'mw-form-status');
  fieldset.append(apply);
  form.append(fieldset, status);
  const selection = createFormSelection(editor);
  const cleanups: (() => void)[] = [];
  const dirty = new Set<TablePropertiesFormField>();
  let current: TablePropertiesFormTarget | undefined;
  let disposed = false;
  let composing = false;
  let restoring = 0;
  let focusing = false;
  let focusSelectionChanged = false;
  let revision = 0;
  let statusKey: TablePropertiesFormMessageKey = 'ui.tableProperties.ready';
  const text = (key: TablePropertiesFormMessageKey) => localize(editor.getLocale(), key, tablePropertiesFormMessages);
  const assertActive = () => {
    if (disposed) throw new Error('Table properties form has been destroyed.');
  };
  const focusedEditor = () => document.activeElement === surface || surface.contains(document.activeElement);
  const nativeRange = () => {
    const native = document.getSelection();
    return native?.rangeCount === 1 ? native.getRangeAt(0).cloneRange() : undefined;
  };
  const getValues = (): TablePropertiesFormValues => {
    assertActive();
    return Object.fromEntries(controls.map(({ key, input }) => [key, input instanceof document.defaultView!.HTMLSelectElement && input.value === '__mixed' ? '' : input.value])) as unknown as TablePropertiesFormValues;
  };
  const reset = () => {
    current = undefined;
    dirty.clear();
    for (const control of controls) control.input.value = '';
  };
  const render = () => {
    form.setAttribute('aria-label', label ?? text('ui.tableProperties.label'));
    fieldset.disabled = !current || composing || editor.isReadOnly();
    for (const control of controls) {
      const caption = text(`ui.tableProperties.${control.key}`);
      control.caption.textContent = caption;
      control.input.setAttribute('aria-label', caption);
      const mixed = current?.values[control.key] === 'mixed';
      if (control.input instanceof document.defaultView!.HTMLInputElement) {
        control.input.placeholder = mixed ? text('ui.tableProperties.mixed') : '';
      }
      for (const option of control.input.querySelectorAll('option')) {
        const key = option.dataset.mwPropertyLabel!;
        option.textContent = text(`ui.tableProperties.${key}` as TablePropertiesFormMessageKey);
      }
    }
    apply.textContent = text('ui.tableProperties.apply');
    apply.disabled = fieldset.disabled || dirty.size === 0;
    status.textContent = text(statusKey);
    status.dataset.error = String(statusKey === 'ui.tableProperties.error' || statusKey === 'ui.tableProperties.selection');
  };
  const eligible = (target: TablePropertiesFormTarget) => {
    if (target.revision !== revision || !ordinaryTableRange(editor, target.range)) return false;
    const next = tablePropertyTarget(editor, target.range);
    return Boolean(next && next.revision === target.state.revision && sameTablePropertyTarget(target.state, next));
  };
  const refresh = () => {
    if (disposed || restoring) return;
    if (focusedEditor()) {
      const range = nativeRange();
      const state = range && ordinaryTableRange(editor, range) ? tablePropertyTarget(editor, range) : undefined;
      const values = state ? api.getState() : undefined;
      if (range && state && values && !values.disabled) {
        const same = current && current.revision === revision && sameTablePropertyTarget(current.state, state);
        if (!same) dirty.clear();
        selection.capture();
        current = { state, range, values, revision };
        for (const { key, input } of controls) {
          if (!dirty.has(key)) input.value = values[key] === 'mixed' && input instanceof document.defaultView!.HTMLSelectElement ? '__mixed'
            : values[key] === false || values[key] === 'mixed' ? '' : String(values[key]);
        }
      }
      else if (!composing && !editor.isReadOnly()) reset();
    }
    else if ((!form.contains(document.activeElement) && !editor.isReadOnly()) || !current || !eligible(current)) reset();
    render();
  };
  const setValues = (values: Partial<TablePropertiesFormValues>) => {
    assertActive();
    const checked = checkedFormValues(values);
    for (const { key, input } of controls) {
      if (Object.hasOwn(checked, key)) {
        input.value = checked[key]!;
        dirty.add(key);
      }
    }
    render();
  };
  const report = (key: TablePropertiesFormMessageKey, error?: unknown) => {
    if (disposed) return;
    statusKey = key;
    render();
    if (error !== undefined) {
      try { void Promise.resolve(onError?.(error)).catch(() => {}); }
      catch { /* Presentation cannot escape event handling. */ }
    }
  };
  const submit = (event?: Event) => {
    event?.preventDefault();
    if (disposed || !form.isConnected || composing || editor.isReadOnly() || !dirty.size || !current) return;
    const previous = current;
    if (!eligible(previous)) { reset(); report('ui.tableProperties.selection'); return; }
    const patch = propertyPatch(getValues(), dirty);
    restoring++;
    try {
      focusSelectionChanged = false;
      focusing = true;
      let restoredSelection = false;
      try {
        restoredSelection = selection.restore(() => {
          if (disposed || composing || editor.isReadOnly() || !eligible(previous) || !focusedEditor()) return false;
          const range = nativeRange();
          if (!range) return true;
          const cells = [range.startContainer, range.endContainer].map((node) =>
            (node.nodeType === 1 ? node as Element : node.parentElement)?.closest('td,th'));
          if (cells.some(Boolean) && (!ordinaryTableRange(editor, range) || !cells[0] || cells[0] !== cells[1]
            || !previous.state.cells.includes(cells[0] as HTMLTableCellElement))) return false;
          const target = tablePropertyTarget(editor, range);
          return !target || sameTablePropertyTarget(previous.state, target);
        });
      }
      finally { focusing = false; }
      if (focusSelectionChanged) { reset(); report('ui.tableProperties.selection'); return; }
      if (!restoredSelection || disposed || composing || editor.isReadOnly() || !eligible(previous) || !focusedEditor()) return;
      const restored = tablePropertyTarget(editor);
      if (!restored || restored.revision !== previous.state.revision || !sameTablePropertyTarget(previous.state, restored)) {
        reset();
        report('ui.tableProperties.selection');
        return;
      }
      api.update(patch);
      if (disposed) return;
      dirty.clear();
      statusKey = 'ui.tableProperties.applied';
    }
    catch (error) { report('ui.tableProperties.error', error); }
    finally {
      restoring--;
      refresh();
    }
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    if (event.isComposing || event.keyCode === 229) { event.preventDefault(); return; }
    if (event.target instanceof document.defaultView!.HTMLInputElement) submit(event);
  };
  const changed = (event: Event) => {
    const control = controls.find(({ input }) => input === event.target);
    if (disposed || !control) return;
    dirty.add(control.key);
    render();
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    current = undefined;
    dirty.clear();
    const failures: unknown[] = [];
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    try { selection.destroy(); }
    catch (error) { failures.push(error); }
    form.remove();
    if (failures.length) throw new AggregateError(failures, 'Table properties form cleanup failed.');
  };
  try {
    cleanups.push(tables.registerSelectionHost(host));
    cleanups.push(listenToUI(form, 'pointerdown', () => selection.capture(), true));
    cleanups.push(listenToUI(form, 'input', changed), listenToUI(form, 'change', changed));
    cleanups.push(listenToUI(apply, 'pointerdown', (event) => {
      // Keep the field's focus until Apply restores the editor, including WebKit
      // where a pointer-activated button need not become document.activeElement.
      if (!disposed && current && !composing && !editor.isReadOnly()) event.preventDefault();
    }));
    cleanups.push(listenToUI(form, 'keydown', keyboard), listenToUI(apply, 'click', submit));
    cleanups.push(editor.onSelectionChange(() => {
      if (focusing) {
        const range = nativeRange();
        const target = range && tablePropertyTarget(editor, range);
        if (!current || !target || !sameTablePropertyTarget(current.state, target)) focusSelectionChanged = true;
      }
      refresh();
    }), editor.events.on(tableSelectionChange, refresh));
    cleanups.push(listenToUI(surface, 'click', refresh), listenToUI(document, 'focusin', refresh));
    cleanups.push(editor.subscribe((change) => {
      revision++;
      if (change.source === 'api') composing = false;
      if (restoring) return;
      reset();
      statusKey = 'ui.tableProperties.ready';
      refresh();
    }));
    cleanups.push(editor.events.on('localechange', render));
    cleanups.push(editor.events.on('readonlychange', () => {
      revision++;
      composing = false;
      if (current) {
        const state = tablePropertyTarget(editor, current.range);
        if (state && state.table === current.state.table && state.cells.length === current.state.cells.length
          && state.cells.every((cell, index) => cell === current!.state.cells[index])) current = { ...current, state, revision };
        else reset();
      }
      render();
    }));
    cleanups.push(listenToUI(surface, 'compositionstart', () => {
      if (editor.isReadOnly()) return;
      composing = true;
      revision++;
      render();
    }));
    cleanups.push(listenToUI(surface, 'compositionend', () => {
      composing = false;
      reset();
      refresh();
    }));
    cleanups.push(editor.events.on('destroy', destroy));
    host.append(form);
    refresh();
  }
  catch (error) {
    destroy();
    throw error;
  }
  return { element: form, refresh, getValues, setValues, destroy };
};
