import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { searchCommands } from '../../search/index.js';
import type { SearchState } from '../../search/types.js';
import { searchFormMessages } from './messages.js';
import type { SearchFormController, SearchFormMessageKey, SearchFormOptions, SearchFormValues } from './types.js';

export { searchFormMessages } from './messages.js';
export type { SearchFormController, SearchFormMessageKey, SearchFormOptions, SearchFormValues } from './types.js';

const validateValues = (patch: Partial<SearchFormValues>): void => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Search form values must be an object.');
  for (const key of ['query', 'replacement'] as const) {
    if (patch[key] !== undefined && typeof patch[key] !== 'string') throw new TypeError(`Search form ${key} must be a string.`);
  }
  for (const key of ['caseSensitive', 'wholeWord'] as const) {
    if (patch[key] !== undefined && typeof patch[key] !== 'boolean') throw new TypeError(`Search form ${key} must be boolean.`);
  }
};

const mergeValues = (values: SearchFormValues, patch: Partial<SearchFormValues>): SearchFormValues => ({
  query: patch.query ?? values.query,
  replacement: patch.replacement ?? values.replacement,
  caseSensitive: patch.caseSensitive ?? values.caseSensitive,
  wholeWord: patch.wholeWord ?? values.wholeWord,
});

export const createSearchForm = (host: HTMLElement, editor: Editor, options: SearchFormOptions = {}): SearchFormController => {
  const api = searchCommands(editor);
  editor.getLocale();
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('Search form label must be a string.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('Search form onError must be a function.');
  validateValues(options.initialValues ?? {});
  let state = api.getState();
  let values = mergeValues({
    query: state.query, replacement: '', caseSensitive: state.options.caseSensitive,
    wholeWord: state.options.wholeWord,
  }, options.initialValues ?? {});
  let disposed = false;
  let statusMessage: SearchFormMessageKey | undefined;
  let replaced = 0;
  const document = host.ownerDocument;
  const element = document.createElement('section');
  element.className = 'mw-form mw-search-form';
  element.setAttribute('role', 'form');
  const fields = document.createElement('div');
  fields.className = 'mw-form-fields';
  const actions = document.createElement('div');
  actions.className = 'mw-form-actions';
  const status = document.createElement('p');
  status.className = 'mw-form-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const queryLabel = document.createElement('label');
  const queryText = document.createElement('span');
  const query = document.createElement('input');
  query.type = 'text'; query.maxLength = 1000;
  queryLabel.append(queryText, query);
  const replacementLabel = document.createElement('label');
  const replacementText = document.createElement('span');
  const replacement = document.createElement('input');
  replacement.type = 'text'; replacement.maxLength = 20000;
  replacementLabel.append(replacementText, replacement);
  const caseLabel = document.createElement('label');
  caseLabel.className = 'mw-form-checkbox';
  const caseSensitive = document.createElement('input');
  caseSensitive.type = 'checkbox';
  const caseText = document.createElement('span');
  caseLabel.append(caseSensitive, caseText);
  const wholeLabel = document.createElement('label');
  wholeLabel.className = 'mw-form-checkbox';
  const wholeWord = document.createElement('input');
  wholeWord.type = 'checkbox';
  const wholeText = document.createElement('span');
  wholeLabel.append(wholeWord, wholeText);
  const find = document.createElement('button');
  find.type = 'button';
  const previous = document.createElement('button');
  previous.type = 'button';
  const next = document.createElement('button');
  next.type = 'button';
  const replaceCurrent = document.createElement('button');
  replaceCurrent.type = 'button';
  const replaceAll = document.createElement('button');
  replaceAll.type = 'button';
  const clear = document.createElement('button');
  clear.type = 'button';
  fields.append(queryLabel, caseLabel, wholeLabel, replacementLabel);
  actions.append(find, previous, next, replaceCurrent, replaceAll, clear);
  element.append(fields, actions, status);

  const assertActive = () => {
    if (disposed) throw new Error('Search form has been destroyed.');
  };
  const message = (key: SearchFormMessageKey) => localize(editor.getLocale(), key, searchFormMessages);
  const sameQuery = () => values.query === state.query && values.caseSensitive === state.options.caseSensitive && values.wholeWord === state.options.wholeWord;
  const readFields = () => {
    values = { query: query.value, replacement: replacement.value, caseSensitive: caseSensitive.checked, wholeWord: wholeWord.checked };
  };
  const writeFields = () => {
    query.value = values.query;
    replacement.value = values.replacement;
    caseSensitive.checked = values.caseSensitive;
    wholeWord.checked = values.wholeWord;
  };
  const renderStatus = () => {
    let key = statusMessage;
    if (!key) key = !sameQuery() ? 'ui.search.pending' : state.error ? 'ui.search.overflow' : !state.query ? 'ui.search.prompt' : !state.matches.length ? 'ui.search.empty' : 'ui.search.matches';
    status.textContent = message(key).replaceAll('{current}', String(state.current + 1)).replaceAll('{total}', String(state.matches.length)).replaceAll('{count}', String(replaced));
    status.classList.toggle('mw-form-error', key === 'ui.search.queryError' || key === 'ui.search.replaceError' || key === 'ui.search.overflow');
  };
  const updateControls = () => {
    if (disposed) return;
    const available = sameQuery() && state.matches.length > 0 && !state.error;
    previous.disabled = !available;
    next.disabled = !available;
    replaceCurrent.disabled = !available || editor.isReadOnly();
    replaceAll.disabled = !available || editor.isReadOnly();
    replacement.disabled = editor.isReadOnly();
    renderStatus();
  };
  const updateLocale = () => {
    if (disposed) return;
    element.setAttribute('aria-label', options.label ?? message('ui.search.label'));
    queryText.textContent = message('ui.search.query');
    replacementText.textContent = message('ui.search.replacement');
    caseText.textContent = message('ui.search.caseSensitive');
    wholeText.textContent = message('ui.search.wholeWord');
    for (const [button, key] of [[find, 'ui.search.find'], [previous, 'ui.search.previous'], [next, 'ui.search.next'], [replaceCurrent, 'ui.search.replaceCurrent'], [replaceAll, 'ui.search.replaceAll'], [clear, 'ui.search.clear']] as const) button.textContent = message(key);
    updateControls();
  };
  const acceptState = (incoming: SearchState) => {
    if (disposed) return;
    if (statusMessage === 'ui.search.replaced') statusMessage = undefined;
    const changedQuery = incoming.query !== state.query || incoming.options.caseSensitive !== state.options.caseSensitive || incoming.options.wholeWord !== state.options.wholeWord;
    state = incoming;
    if (changedQuery && !element.contains(document.activeElement)) {
      statusMessage = undefined;
      query.removeAttribute('aria-invalid');
      replacement.removeAttribute('aria-invalid');
      values = { ...values, query: state.query, caseSensitive: state.options.caseSensitive, wholeWord: state.options.wholeWord };
      writeFields();
    }
    updateControls();
  };
  const report = (error: unknown, key: SearchFormMessageKey) => {
    statusMessage = key;
    query.setAttribute('aria-invalid', String(key === 'ui.search.queryError'));
    replacement.setAttribute('aria-invalid', String(key === 'ui.search.replaceError'));
    updateControls();
    options.onError?.(error);
  };
  const submit = () => {
    if (disposed) return;
    readFields();
    statusMessage = undefined;
    query.removeAttribute('aria-invalid');
    replacement.removeAttribute('aria-invalid');
    try {
      api.setQuery(values.query, { caseSensitive: values.caseSensitive, wholeWord: values.wholeWord });
      state = api.getState();
      if (state.matches.length) api.select(0);
      updateControls();
    }
    catch (error) { report(error, 'ui.search.queryError'); }
  };
  const input = () => {
    if (disposed) return;
    readFields();
    statusMessage = undefined;
    query.removeAttribute('aria-invalid');
    replacement.removeAttribute('aria-invalid');
    updateControls();
  };
  const navigate = (forward: boolean) => {
    if (disposed) return;
    readFields();
    if (!sameQuery() || !state.matches.length || state.error) return;
    statusMessage = undefined;
    try {
      if (forward) api.next(); else api.previous();
      state = api.getState();
      updateControls();
    }
    catch (error) { report(error, 'ui.search.queryError'); }
  };
  const replace = (all: boolean) => {
    if (disposed || editor.isReadOnly()) return;
    readFields();
    if (!sameQuery() || !state.matches.length || state.error) return;
    try {
      replaced = all ? api.replaceAll(values.replacement) : Number(api.replaceCurrent(values.replacement));
      state = api.getState();
      statusMessage = 'ui.search.replaced';
      updateControls();
    }
    catch (error) { report(error, 'ui.search.replaceError'); }
  };
  const clearSearch = () => {
    if (disposed) return;
    statusMessage = undefined;
    values = { ...values, query: '', caseSensitive: false, wholeWord: false };
    api.clear();
    state = api.getState();
    writeFields();
    query.removeAttribute('aria-invalid');
    replacement.removeAttribute('aria-invalid');
    updateControls();
  };
  const previousClick = () => navigate(false);
  const nextClick = () => navigate(true);
  const replaceClick = () => replace(false);
  const replaceAllClick = () => replace(true);
  const keydown = (event: KeyboardEvent) => {
    if (disposed || event.defaultPrevented || event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    if (event.target !== query && event.target !== replacement) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target === replacement) replace(false); else submit();
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    unsubscribeSearch();
    unsubscribeLocale();
    unsubscribeReadOnly();
    unsubscribeDestroy();
    find.removeEventListener('click', submit);
    element.removeEventListener('keydown', keydown);
    element.removeEventListener('input', input);
    element.removeEventListener('change', input);
    previous.removeEventListener('click', previousClick);
    next.removeEventListener('click', nextClick);
    replaceCurrent.removeEventListener('click', replaceClick);
    replaceAll.removeEventListener('click', replaceAllClick);
    clear.removeEventListener('click', clearSearch);
    element.remove();
  };
  const unsubscribeSearch = api.subscribe(acceptState);
  const unsubscribeLocale = editor.events.on('localechange', updateLocale);
  const unsubscribeReadOnly = editor.events.on('readonlychange', updateControls);
  const unsubscribeDestroy = editor.events.on('destroy', destroy);
  writeFields();
  updateLocale();
  find.addEventListener('click', submit);
  element.addEventListener('keydown', keydown);
  element.addEventListener('input', input);
  element.addEventListener('change', input);
  previous.addEventListener('click', previousClick);
  next.addEventListener('click', nextClick);
  replaceCurrent.addEventListener('click', replaceClick);
  replaceAll.addEventListener('click', replaceAllClick);
  clear.addEventListener('click', clearSearch);
  host.append(element);
  return {
    element,
    refresh: () => { assertActive(); acceptState(api.getState()); updateLocale(); },
    getValues: () => { assertActive(); readFields(); return { ...values }; },
    setValues: (patch) => {
      assertActive();
      validateValues(patch);
      readFields();
      values = mergeValues(values, patch);
      statusMessage = undefined;
      query.removeAttribute('aria-invalid');
      replacement.removeAttribute('aria-invalid');
      writeFields();
      updateControls();
    },
    destroy,
  };
};
