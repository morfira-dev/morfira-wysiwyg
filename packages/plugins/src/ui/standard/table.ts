import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { tableCommands } from '../../tables/index.js';
import type { FormSelection } from '../shared/types.js';
import type { TablePanelController } from './internal-types.js';
import { standardEditorUIMessages } from './messages.js';
import type { StandardEditorUIMessageKey } from './types.js';

export const createTablePanel = (
  host: HTMLElement,
  editor: Editor,
  selection: FormSelection,
  initial: { rows: number; columns: number },
  canEdit: () => boolean,
  success: () => void,
  report: (key: StandardEditorUIMessageKey, error?: unknown) => void,
): TablePanelController => {
  const api = tableCommands(editor);
  const document = host.ownerDocument;
  const form = document.createElement('section');
  form.className = 'mw-form mw-table-form';
  form.setAttribute('role', 'form');
  const makeField = (value: number) => {
    const label = document.createElement('label');
    const caption = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '100';
    input.step = '1';
    input.value = String(value);
    label.append(caption, input);
    form.append(label);
    return { caption, input };
  };
  const rows = makeField(initial.rows);
  const columns = makeField(initial.columns);
  const insert = document.createElement('button');
  insert.type = 'button';
  form.append(insert);
  let disposed = false;
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
  };
  const submit = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (disposed || !canEdit()) return;
    try {
      const values = [rows.input.value, columns.input.value];
      if (values.some((value) => !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100))
        throw new RangeError('Table dimensions must be integers from 1 to 100.');
      if (!selection.restore()) {
        report('ui.standard.selection');
        return;
      }
      api.insert(Number(values[0]), Number(values[1]));
      success();
    }
    catch (error) { report('ui.standard.error', error); }
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || !(event.target instanceof HTMLInputElement)) return;
    submit(event);
  };
  insert.addEventListener('click', submit);
  form.addEventListener('keydown', keydown);
  host.append(form);
  refresh();
  return {
    refresh,
    destroy: () => {
      if (disposed) return;
      disposed = true;
      insert.removeEventListener('click', submit);
      form.removeEventListener('keydown', keydown);
      form.remove();
    },
  };
};
