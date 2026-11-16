import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createFormSelection } from '../shared/selection.js';
import { createFormInput, createUIButton, createUIElement, createUIStatus } from '../shared/elements.js';
import { listenToUI } from '../shared/events.js';
import { linkFormMessages } from './messages.js';
import type { LinkFormController, LinkFormMessageKey, LinkFormOptions, LinkFormValues } from './types.js';

export { linkFormMessages } from './messages.js';
export type { LinkFormController, LinkFormMessageKey, LinkFormOptions, LinkFormValues } from './types.js';

const checkedValues = (input: Partial<LinkFormValues>): Partial<LinkFormValues> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Link form values must be an object.');
  const result: Partial<LinkFormValues> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'newTab') {
      if (typeof value !== 'boolean') throw new TypeError('Link form newTab must be boolean.');
      result.newTab = value;
    }
    else if (key === 'href' || key === 'title' || key === 'text') {
      if (typeof value !== 'string') throw new TypeError(`Link form ${key} must be a string.`);
      result[key] = value;
    }
    else throw new TypeError(`Unknown link form field: ${key}`);
  }
  return result;
};

const anchorAt = (range: Range | undefined, surface: HTMLElement): HTMLAnchorElement | undefined => {
  if (!range) return;
  const node = range.startContainer;
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  const anchor = element?.closest('a');
  if (anchor instanceof HTMLAnchorElement && surface.contains(anchor)) return anchor;
  return !range.collapsed ? range.cloneContents().querySelector('a') ?? undefined : undefined;
};

export const createLinkForm = (host: HTMLElement, editor: Editor, options: LinkFormOptions = {}): LinkFormController => {
  editor.getLocale();
  if (editor.surface.contains(host)) throw new Error('Mount link forms outside persisted editor content.');
  if (options.label !== undefined && typeof options.label !== 'string') throw new TypeError('The link form label must be a string.');
  if (options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('The link form error callback must be a function.');
  const initial = checkedValues(options.initialValues ?? {});
  const document = host.ownerDocument;
  const element = createUIElement(document, 'section', 'mw-form mw-link-form');
  element.setAttribute('role', 'form');
  const fields = createUIElement(document, 'fieldset', 'mw-form-fields');
  const captions = new Map<HTMLElement, LinkFormMessageKey>();
  const textField = (key: LinkFormMessageKey, type = 'text') => {
    const { label, caption, input } = createFormInput(document, type);
    input.maxLength = 20000;
    fields.append(label);
    captions.set(caption, key);
    return input;
  };
  const href = textField('ui.links.href');
  const title = textField('ui.links.title');
  const text = textField('ui.links.text');
  const { label: checkboxLabel, caption: checkboxCaption, input: newTab } = createFormInput(document, 'checkbox', true);
  captions.set(checkboxCaption, 'ui.links.newTab');
  fields.append(checkboxLabel);
  const actions = createUIElement(document, 'div', 'mw-form-actions');
  const submit = createUIButton(document);
  const unlink = createUIButton(document);
  actions.append(submit, unlink);
  fields.append(actions);
  const status = createUIStatus(document, 'mw-form-status');
  element.append(fields, status);
  const selection = createFormSelection(editor);
  let disposed = false;
  let editing = false;
  let signature: string | undefined;
  let statusKey: LinkFormMessageKey | undefined;
  const subscriptions: (() => void)[] = [];
  let stopDOM: (() => void)[] = [];
  const assertActive = () => {
    if (disposed) throw new Error('Link form has been destroyed.');
  };
  const getValues = (): LinkFormValues => {
    assertActive();
    return { href: href.value, title: title.value, text: text.value, newTab: newTab.checked };
  };
  const write = (patch: Partial<LinkFormValues>) => {
    if (patch.href !== undefined) href.value = patch.href;
    if (patch.title !== undefined) title.value = patch.title;
    if (patch.text !== undefined) text.value = patch.text;
    if (patch.newTab !== undefined) newTab.checked = patch.newTab;
  };
  write({ href: '', title: '', text: '', newTab: false, ...initial });
  const update = () => {
    if (disposed) return;
    const locale = editor.getLocale();
    element.setAttribute('aria-label', options.label ?? localize(locale, 'ui.links.label', linkFormMessages));
    for (const [node, key] of captions) node.textContent = localize(locale, key, linkFormMessages);
    submit.textContent = localize(locale, editing ? 'ui.links.update' : 'ui.links.create', linkFormMessages);
    unlink.textContent = localize(locale, 'ui.links.unlink', linkFormMessages);
    fields.disabled = editor.isReadOnly();
    unlink.disabled = !editing || editor.isReadOnly();
    status.textContent = statusKey ? localize(locale, statusKey, linkFormMessages) : '';
  };
  const refresh = () => {
    if (disposed) return;
    const anchor = anchorAt(selection.peek(), editor.surface);
    const next = anchor?.outerHTML ?? '';
    editing = Boolean(anchor);
    if (!element.contains(document.activeElement) && next !== signature) {
      if (anchor) write({ href: anchor.getAttribute('href') ?? '', title: anchor.getAttribute('title') ?? '', newTab: anchor.getAttribute('target') === '_blank', text: '' });
      else if (signature) write({ href: '', title: '', text: '', newTab: false });
    }
    signature = next;
    update();
  };
  const report = (key: LinkFormMessageKey, error?: unknown) => {
    statusKey = key;
    update();
    if (error !== undefined) options.onError?.(error);
  };
  const perform = (remove: boolean) => {
    if (disposed || editor.isReadOnly()) return;
    const values = getValues();
    if (!selection.restore()) {
      report('ui.links.select');
      return;
    }
    const range = selection.peek();
    const anchor = anchorAt(range, editor.surface);
    if (!remove && range?.collapsed && !anchor && !values.text) {
      report('ui.links.textRequired');
      return;
    }
    if (remove && !anchor) return;
    try {
      editor.format('link', remove ? false : {
        href: values.href, title: values.title, target: values.newTab ? '_blank' : '_self',
        ...(range?.collapsed && !anchor ? { text: values.text } : {}),
      });
      selection.capture();
      refresh();
      report(remove ? 'ui.links.removed' : 'ui.links.saved');
    }
    catch (error) { report('ui.links.invalid', error); }
  };
  const capture = (event: Event) => {
    if (disposed) return;
    selection.capture();
    // Safari otherwise blurs the input before click and can move the editor range.
    if (event.type === 'pointerdown' && event.target instanceof Element && event.target.closest('button')) event.preventDefault();
  };
  const submitted = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    perform(false);
  };
  const removed = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    perform(true);
  };
  const keydown = (event: KeyboardEvent) => {
    if (disposed || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      event.stopPropagation();
      perform(false);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    selection.restore();
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    for (const stop of subscriptions) stop();
    selection.destroy();
    for (const stop of stopDOM) stop();
    element.remove();
  };
  stopDOM = [
    listenToUI(element, 'pointerdown', capture),
    listenToUI(element, 'focusin', capture),
    listenToUI(submit, 'click', submitted),
    listenToUI(element, 'keydown', keydown),
    listenToUI(unlink, 'click', removed),
  ];
  subscriptions.push(editor.onSelectionChange(refresh), editor.subscribe((change) => {
    if (change.source === 'api') { editing = false; signature = undefined; statusKey = undefined; }
    refresh();
  }), editor.events.on('readonlychange', update), editor.events.on('localechange', update), editor.events.on('destroy', destroy));
  host.append(element);
  refresh();
  return {
    element,
    refresh: () => { assertActive(); selection.capture(); refresh(); },
    getValues,
    setValues: (values) => {
      assertActive();
      write(checkedValues(values));
      statusKey = undefined;
      update();
    },
    destroy,
  };
};
