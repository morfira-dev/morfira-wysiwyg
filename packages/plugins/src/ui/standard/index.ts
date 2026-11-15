import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { tableCommands } from '../../tables/index.js';
import { imageCommands } from '../../images/index.js';
import { searchCommands } from '../../search/index.js';
import { horizontalRuleCommands } from '../../horizontal-rule/index.js';
import { createEditorUI, createDefaultEditorUIGroups } from '../editor/index.js';
import type { EditorUIController, EditorUIItem } from '../editor/types.js';
import { createFormSelection } from '../shared/selection.js';
import { createLinkForm } from '../links/index.js';
import type { LinkFormValues } from '../links/types.js';
import { createImageForm } from '../images/index.js';
import type { ImageFormValues } from '../images/types.js';
import { createSearchForm } from '../search/index.js';
import type { SearchFormValues } from '../search/types.js';
import { createTablePanel } from './table.js';
import { standardEditorUIMessages } from './messages.js';
import type { ActiveStandardPanel, StandardPanel } from './internal-types.js';
import type { StandardEditorUIController, StandardEditorUIOptions, StandardEditorUIMessageKey } from './types.js';

export { standardEditorUIMessages } from './messages.js';
export type { StandardEditorUIController, StandardEditorUIOptions, StandardEditorUIMessageKey } from './types.js';

const panels: readonly StandardPanel[] = ['link', 'image', 'search', 'table'];
const messageFor: Record<StandardPanel, StandardEditorUIMessageKey> = {
  link: 'ui.standard.link', image: 'ui.standard.image', search: 'ui.standard.search', table: 'ui.standard.table',
};
const record = (value: unknown): boolean => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const panelIDs = new WeakMap<Document, number>();
const createPanelID = (document: Document): string => {
  let next = panelIDs.get(document) ?? 0;
  let id: string;
  do {
    next += 1;
    id = `mw-ui-panel-${next}`;
  } while (document.getElementById(id) || document.getElementById(`${id}-title`));
  panelIDs.set(document, next);
  return id;
};

export const createStandardEditorUI = (host: HTMLElement, editor: Editor, options: StandardEditorUIOptions = {}): StandardEditorUIController => {
  editor.getLocale();
  if (host.childNodes.length || host === editor.surface || editor.surface.contains(host))
    throw new Error('Mount editor UI into an empty host outside persisted editor content.');
  if (!record(options) || Object.keys(options).some((key) => !['density', 'overflow', 'label', 'onError', 'links', 'images', 'search', 'table'].includes(key)))
    throw new TypeError('Expected standard editor UI options.');
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('The UI label must be a string.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('The UI error handler must be a callback.');
  if (options.overflow !== undefined && !['wrap', 'more'].includes(options.overflow)) throw new TypeError('Invalid standard UI overflow.');
  for (const value of [options.links, options.images, options.search, options.table]) {
    if (value !== undefined && !record(value)) throw new TypeError('UI feature options must be objects.');
  }
  const dimensions = { rows: options.table?.rows ?? 3, columns: options.table?.columns ?? 3 };
  if (Object.keys(options.table ?? {}).some((key) => key !== 'rows' && key !== 'columns') || Object.values(dimensions).some((value) => !Number.isInteger(value) || value < 1 || value > 100))
    throw new RangeError('Initial table dimensions must be integers from 1 to 100.');
  // Validate all required behavior before mounting UI or installing listeners.
  tableCommands(editor);
  imageCommands(editor);
  searchCommands(editor);
  const linkOptions = { ...options.links, ...(options.links?.initialValues ? { initialValues: { ...options.links.initialValues } } : {}) };
  const imageOptions = { ...options.images, ...(options.images?.initialValues ? { initialValues: { ...options.images.initialValues } } : {}) };
  const searchOptions = { ...options.search, ...(options.search?.initialValues ? { initialValues: { ...options.search.initialValues } } : {}) };
  const document = host.ownerDocument;
  const element = document.createElement('section');
  element.className = 'mw-standard-editor-ui';
  const toolbarHost = document.createElement('div');
  const panel = document.createElement('section');
  panel.className = 'mw-ui-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.id = createPanelID(document);
  const title = document.createElement('h3');
  title.className = 'mw-ui-panel-title';
  title.id = `${panel.id}-title`;
  panel.setAttribute('aria-labelledby', title.id);
  const close = document.createElement('button');
  close.className = 'mw-ui-panel-close';
  close.type = 'button';
  const header = document.createElement('div');
  header.className = 'mw-ui-panel-header';
  header.append(title, close);
  const body = document.createElement('div');
  body.className = 'mw-ui-panel-body';
  panel.append(header, body);
  const status = document.createElement('p');
  status.className = 'mw-ui-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  element.append(toolbarHost, panel, status);
  const selection = createFormSelection(editor);
  const cleanups: (() => void)[] = [];
  let shell: EditorUIController | undefined;
  let active: ActiveStandardPanel | undefined;
  let invoker: HTMLButtonElement | undefined;
  let linkDraft: LinkFormValues | undefined;
  let imageDraft: ImageFormValues | undefined;
  let searchDraft: SearchFormValues | undefined;
  let statusKey: StandardEditorUIMessageKey | undefined;
  let disposed = false;
  let composing = false;
  const text = (key: StandardEditorUIMessageKey) => localize(editor.getLocale(), key, standardEditorUIMessages);
  const assertActive = () => {
    if (disposed) throw new Error('Standard editor UI has been destroyed.');
  };
  const diagnose = (error: unknown, feature?: (error: unknown) => void) => {
    for (const callback of [feature, options.onError]) {
      try { callback?.(error); }
      catch { /* A diagnostic callback must not interrupt UI cleanup. */ }
    }
  };
  const updateLaunchers = () => {
    for (const kind of panels) {
      const button = toolbarHost.querySelector<HTMLButtonElement>(`[data-mw-ui-action="${kind}"]`);
      button?.setAttribute('aria-expanded', String(active?.kind === kind));
      button?.setAttribute('aria-controls', panel.id);
    }
  };
  const updateLocale = () => {
    if (disposed) return;
    element.setAttribute('aria-label', options.label ?? text('ui.standard.label'));
    close.textContent = text('ui.standard.close');
    if (active) title.textContent = text(messageFor[active.kind]);
    status.textContent = statusKey ? text(statusKey) : '';
  };
  const report = (key: StandardEditorUIMessageKey, error?: unknown) => {
    statusKey = key;
    updateLocale();
    if (error !== undefined) diagnose(error);
  };
  const closePanel = (restoreFocus: boolean, remember = true) => {
    const previous = active;
    active = undefined;
    panel.hidden = true;
    if (remember && previous) {
      if (previous.kind === 'link') linkDraft = previous.controller.getValues();
      else if (previous.kind === 'image') imageDraft = previous.controller.getValues();
      else if (previous.kind === 'search') searchDraft = previous.controller.getValues();
    }
    try { previous?.controller.destroy(); }
    finally {
      body.replaceChildren();
      updateLaunchers();
      if (restoreFocus && invoker?.isConnected && !invoker.disabled) {
        const target = invoker.closest('[hidden]') ? toolbarHost.querySelector<HTMLButtonElement>('[data-mw-ui-more]') : invoker;
        target?.focus();
      }
    }
  };
  const refresh = () => {
    if (disposed) return;
    shell?.refresh();
    active?.controller.refresh();
    updateLocale();
    updateLaunchers();
  };
  const openPanel = (kind: StandardPanel) => {
    if (disposed || composing || (kind === 'table' && editor.isReadOnly())) return;
    if (active?.kind === kind) {
      closePanel(true);
      return;
    }
    if (kind !== 'search' && !selection.restore()) {
      report('ui.standard.selection');
      return;
    }
    closePanel(false);
    invoker = toolbarHost.querySelector<HTMLButtonElement>(`[data-mw-ui-action="${kind}"]`) ?? undefined;
    statusKey = undefined;
    try {
      if (kind === 'link') active = {
        kind, controller: createLinkForm(body, editor, {
          ...linkOptions,
          initialValues: linkDraft ?? linkOptions.initialValues,
          onError: (error) => diagnose(error, linkOptions.onError),
        }),
      };
      else if (kind === 'image') active = {
        kind, controller: createImageForm(body, editor, {
          ...imageOptions,
          initialValues: imageDraft ?? imageOptions.initialValues,
          onError: (error) => diagnose(error, imageOptions.onError),
        }),
      };
      else if (kind === 'search') active = {
        kind, controller: createSearchForm(body, editor, {
          ...searchOptions,
          initialValues: searchDraft ?? searchOptions.initialValues,
          onError: (error) => diagnose(error, searchOptions.onError),
        }),
      };
      else active = {
        kind, controller: createTablePanel(body, editor, selection, dimensions,
          () => !disposed && !composing && !editor.isReadOnly(),
          () => { closePanel(false); editor.focus(); }, report),
      };
      panel.hidden = false;
      refresh();
      const focusable = body.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)');
      (focusable ?? close).focus();
    }
    catch (error) {
      closePanel(false, false);
      report('ui.standard.error', error);
    }
  };
  const capture = () => selection.capture();
  const keydown = (event: KeyboardEvent) => {
    if (!active || event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    event.stopPropagation();
    closePanel(true);
  };
  const outside = (event: PointerEvent) => {
    if (active && !event.composedPath().includes(element)) closePanel(false);
  };
  const closeClick = () => closePanel(true);
  const startComposition = () => {
    if (editor.isReadOnly()) return;
    composing = true;
    refresh();
  };
  const endComposition = () => { composing = false; refresh(); };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    const failures: unknown[] = [];
    for (const cleanup of [() => closePanel(false, false), () => shell?.destroy(), () => selection.destroy(), ...cleanups]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    element.remove();
    if (failures.length) throw new AggregateError(failures, 'Standard editor UI cleanup failed.');
  };
  try {
    const launchers: EditorUIItem[] = panels.map((kind) => ({
      id: kind,
      icon: kind,
      label: (instance: Editor) => localize(instance.getLocale(), messageFor[kind], standardEditorUIMessages),
      mutates: false,
      enabled: (instance: Editor) => !composing && (kind !== 'table' || !instance.isReadOnly()),
      run: () => openPanel(kind),
    }));
    const dividers: EditorUIItem[] = editor.getPlugin('horizontal-rule') ? [{
      id: 'horizontal-rule',
      label: (instance) => localize(instance.getLocale(), 'ui.standard.horizontalRule', standardEditorUIMessages),
      text: '—',
      enabled: (instance) => !horizontalRuleCommands(instance).getState(selection.peek()).disabled,
      run: (instance) => horizontalRuleCommands(instance).insert(),
    }] : [];
    shell = createEditorUI(toolbarHost, editor, {
      density: options.density,
      overflow: options.overflow,
      label: options.label,
      onError: (error) => diagnose(error),
      groups: [...createDefaultEditorUIGroups(), ...(dividers.length ? [dividers] : []), launchers],
      groupPriorities: [100, 90, 80, 40, 20, ...(dividers.length ? [10] : []), 60],
    });
    element.addEventListener('pointerdown', capture, true);
    element.addEventListener('keydown', keydown, true);
    document.addEventListener('pointerdown', outside, true);
    close.addEventListener('click', closeClick);
    editor.surface.addEventListener('compositionstart', startComposition);
    editor.surface.addEventListener('compositionend', endComposition);
    cleanups.push(
      () => element.removeEventListener('pointerdown', capture, true),
      () => element.removeEventListener('keydown', keydown, true),
      () => document.removeEventListener('pointerdown', outside, true),
      () => close.removeEventListener('click', closeClick),
      () => editor.surface.removeEventListener('compositionstart', startComposition),
      () => editor.surface.removeEventListener('compositionend', endComposition),
      editor.events.on('localechange', refresh),
      editor.events.on('readonlychange', (readOnly) => {
        if (readOnly) composing = false;
        refresh();
      }),
      editor.subscribe((change) => {
        if (change.source === 'api') {
          composing = false;
          closePanel(false, false);
          linkDraft = undefined;
          imageDraft = undefined;
          searchDraft = undefined;
          statusKey = undefined;
        }
        refresh();
      }),
      editor.events.on('destroy', destroy),
    );
    host.append(element);
    refresh();
  }
  catch (error) {
    destroy();
    throw error;
  }
  return { element, refresh: () => { assertActive(); refresh(); }, destroy };
};
