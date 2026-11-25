import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { tableCommands } from '../../tables/index.js';
import type { FormSelection } from '../shared/types.js';
import { createFormInput, createUIButton, createUIElement } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import type { TablePanelController } from './internal-types.js';
import { standardEditorUIMessages } from './messages.js';
import type { StandardEditorUIMessageKey } from './types.js';
import type { TablePickerController, TablePickerFactory } from '../table-picker/types.js';

export const createTablePanel = (
  host: HTMLElement,
  editor: Editor,
  selection: FormSelection,
  initial: { rows: number; columns: number },
  canEdit: () => boolean,
  success: () => void,
  report: (key: StandardEditorUIMessageKey, error?: unknown) => void,
  pickerFactory?: TablePickerFactory,
): TablePanelController => {
  const api = tableCommands(editor);
  const document = host.ownerDocument;
  const form = createUIElement(document, 'section', 'mw-form mw-table-form');
  form.setAttribute('role', 'form');
  const makeField = (value: number) => {
    const { label, caption, input } = createFormInput(document, 'number');
    input.min = '1';
    input.max = '100';
    input.step = '1';
    input.value = String(value);
    form.append(label);
    return { caption, input };
  };
  const rows = makeField(initial.rows);
  const columns = makeField(initial.columns);
  const insert = createUIButton(document);
  form.append(insert);
  let disposed = false;
  let picker: TablePickerController | undefined;
  const refresh = () => {
    if (disposed) return;
    const locale = editor.getLocale();
    const text = (key: StandardEditorUIMessageKey) => localize(locale, key, standardEditorUIMessages);
    form.setAttribute('aria-label', text('ui.standard.table'));
    rows.caption.textContent = text('ui.standard.rows');
    columns.caption.textContent = text('ui.standard.columns');
    insert.textContent = text('ui.standard.insertTable');
    rows.input.disabled = !canEdit();
    columns.input.disabled = !canEdit();
    insert.disabled = !canEdit();
    picker?.refresh({ locale, disabled: !canEdit() });
  };
  const submit = (event?: Event) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (disposed || !canEdit()) return;
    try {
      const values = [rows.input.value, columns.input.value];
      if (values.some((value) => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100))
        throw new RangeError('Table dimensions must be integers from 1 to 100.');
      if (!selection.restore()) {
        report('ui.standard.selection');
        return;
      }
      if (disposed || !canEdit()) return;
      api.insert(Number(values[0]), Number(values[1]));
      success();
    }
    catch (error) { report('ui.standard.error', error); }
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.key !== 'Enter' || event.isComposing || event.keyCode === 229
      || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !(event.target instanceof HTMLInputElement)) return;
    submit(event);
  };
  const stopDOM = [listenToUI(insert, 'click', submit), listenToUI(form, 'keydown', keydown)];
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    try { picker?.destroy(); }
    finally {
      for (const stop of stopDOM) stop();
      form.remove();
    }
  };
  try {
    if (pickerFactory) {
      const pickerHost = createUIElement(document, 'div');
      form.prepend(pickerHost);
      picker = pickerFactory(pickerHost, {
        ...initial, locale: editor.getLocale(), disabled: !canEdit(),
        onSelect: (r, c) => {
          if (disposed || !canEdit()) return;
          rows.input.value = String(r);
          columns.input.value = String(c);
          submit();
        },
      });
    }
    host.append(form);
    refresh();
  }
  catch (error) {
    destroy();
    throw error;
  }
  return {
    refresh,
    destroy,
  };
};
