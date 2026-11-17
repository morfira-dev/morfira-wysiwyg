import { localize } from '@morfira-dev/wysiwyg-core';
import { createUIButton, createUIElement, createUIStatus } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import { tablePickerMessages } from './messages.js';
import type { TablePickerController, TablePickerOptions, TablePickerState } from './types.js';

export { tablePickerMessages } from './messages.js';
export type { TablePickerController, TablePickerFactory, TablePickerMessageKey, TablePickerOptions, TablePickerState } from './types.js';

const checkedState = (state: TablePickerState): TablePickerState => {
  if (!state || typeof state !== 'object' || typeof state.disabled !== 'boolean' || !state.locale)
    throw new TypeError('Expected table picker locale and disabled state.');
  const { locale, translations } = state.locale;
  if (typeof locale !== 'string' || !locale || locale.length > 100)
    throw new TypeError('Expected a language tag with 1–100 characters.');
  const canonical = Intl.getCanonicalLocales(locale)[0];
  if (!canonical) throw new RangeError('Expected a valid language tag.');
  if (!translations || typeof translations !== 'object' || Array.isArray(translations) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(translations)))
    throw new TypeError('Translations must be a plain record of strings.');
  const entries = Object.entries(translations);
  if (entries.some(([key, value]) => !key || typeof value !== 'string'))
    throw new TypeError('Translation keys must be nonempty and values must be strings.');
  return { locale: { locale: canonical, translations: Object.fromEntries(entries) }, disabled: state.disabled };
};

export const createTablePicker = (host: HTMLElement, options: TablePickerOptions): TablePickerController => {
  let state = checkedState(options);
  if (![options.rows, options.columns].every((value) => Number.isInteger(value) && value >= 1 && value <= 100))
    throw new RangeError('Table dimensions must be integers from 1 to 100.');
  if (typeof options.onSelect !== 'function') throw new TypeError('Expected a table size callback.');
  if (host.childNodes.length) throw new Error('Mount a table picker into an empty host.');
  const document = host.ownerDocument;
  const element = createUIElement(document, 'section', 'mw-table-picker');
  element.setAttribute('role', 'group');
  const matrix = createUIElement(document, 'div', 'mw-table-picker-matrix');
  const status = createUIStatus(document, 'mw-table-picker-status');
  const buttons = Array.from({ length: 64 }, () => createUIButton(document, 'mw-table-picker-cell'));
  matrix.append(...buttons);
  element.append(matrix, status);
  let row = Math.min(8, options.rows) - 1;
  let column = Math.min(8, options.columns) - 1;
  let disposed = false;
  const update = () => {
    element.setAttribute('aria-label', localize(state.locale, 'ui.tablePicker.label', tablePickerMessages));
    const insert = localize(state.locale, 'ui.tablePicker.insert', tablePickerMessages);
    buttons.forEach((button, index) => {
      const r = Math.floor(index / 8);
      const c = index % 8;
      button.setAttribute('aria-label', `${insert}: ${r + 1} × ${c + 1}`);
      button.disabled = state.disabled;
      button.tabIndex = r === row && c === column ? 0 : -1;
      button.classList.toggle('mw-table-picker-selected', r <= row && c <= column);
    });
    status.textContent = `${row + 1} × ${column + 1}`;
  };
  const targetIndex = (event: Event) => buttons.indexOf(event.target as HTMLButtonElement);
  const preview = (event: Event) => {
    const index = targetIndex(event);
    if (disposed || state.disabled || index < 0) return;
    row = Math.floor(index / 8);
    column = index % 8;
    update();
  };
  const click = (event: MouseEvent) => {
    const index = targetIndex(event);
    if (disposed || state.disabled || index < 0 || !element.isConnected) return;
    event.preventDefault();
    event.stopPropagation();
    options.onSelect(Math.floor(index / 8) + 1, index % 8 + 1);
  };
  const keydown = (event: KeyboardEvent) => {
    if (disposed || state.disabled || targetIndex(event) < 0) return;
    if (event.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'ArrowUp') row = Math.max(0, row - 1);
    if (event.key === 'ArrowDown') row = Math.min(7, row + 1);
    if (event.key === 'ArrowLeft') column = Math.max(0, column - 1);
    if (event.key === 'ArrowRight') column = Math.min(7, column + 1);
    if (event.key === 'Home' || event.key === 'End') {
      column = event.key === 'Home' ? 0 : 7;
      if (event.ctrlKey || event.metaKey) row = column;
    }
    update();
    buttons[row * 8 + column].focus();
  };
  update();
  const stops = [
    listenToUI(matrix, 'pointerover', preview),
    listenToUI(matrix, 'focusin', preview),
    listenToUI(matrix, 'click', click),
    listenToUI(matrix, 'keydown', keydown),
  ];
  host.append(element);
  return {
    element,
    refresh: (next) => {
      if (disposed) throw new Error('Table picker has been destroyed.');
      state = checkedState(next);
      update();
    },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      for (const stop of stops) stop();
      element.remove();
    },
  };
};
