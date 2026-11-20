import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createUIButton, createUIStatus } from '../shared/elements.js';
import { outlineUIMessages } from './messages.js';
import type { OutlineUIController, OutlineUIMessageKey, OutlineUIOptions } from './types.js';
import type { OutlineEntry } from './internal-types.js';

export { outlineUIMessages } from './messages.js';
export type { OutlineUIController, OutlineUIMessageKey, OutlineUIOptions } from './types.js';

const headingSelector = 'h1,h2,h3,h4,h5,h6';
const protectedSelector = '[data-mw-node],pre,code,figure,figcaption';

export const createOutlineUI = (host: HTMLElement, editor: Editor, options: OutlineUIOptions = {}): OutlineUIController => {
  editor.getLocale();
  const root = editor.surface;
  const document = root.ownerDocument;
  const view = document.defaultView!;
  if (!(host instanceof view.HTMLElement) || host.ownerDocument !== document || !host.isConnected
    || host.childNodes.length || root.contains(host) || host.namespaceURI !== 'http://www.w3.org/1999/xhtml')
    throw new TypeError('Outline needs an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(options))
    || Reflect.ownKeys(options).some((key) => typeof key !== 'string' || !['label', 'maxHeadings', 'onError'].includes(key)))
    throw new TypeError('Expected outline UI options.');
  const { label, maxHeadings = 100, onError } = options;
  if (label !== undefined && (typeof label !== 'string' || !label || label.length > 160 || /[\u0000-\u001f\u007f-\u009f]/.test(label)))
    throw new TypeError('Outline label must be bounded literal text.');
  if (!Number.isInteger(maxHeadings) || maxHeadings < 1 || maxHeadings > 500) throw new RangeError('Outline heading limit must be 1–500.');
  if (onError !== undefined && typeof onError !== 'function') throw new TypeError('Outline diagnostics must be a callback.');
  const element = document.createElement('nav');
  element.className = 'mw-outline';
  const list = document.createElement('ol');
  list.className = 'mw-outline-list';
  const status = createUIStatus(document, 'mw-outline-status');
  element.append(list, status);
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let generation = 0;
  let frame = 0;
  let entries: OutlineEntry[] = [];
  const message = (key: OutlineUIMessageKey): string => localize(editor.getLocale(), key, outlineUIMessages);
  const owned = (): boolean => host.ownerDocument === document && root.ownerDocument === document
    && element.ownerDocument === document && editor.element.ownerDocument === document
    && editor.element.isConnected && editor.element.contains(root) && root.isConnected
    && host.isConnected && element.isConnected && host.contains(element) && !root.contains(element);
  const eligible = (heading: Element): heading is HTMLHeadingElement => heading.namespaceURI === 'http://www.w3.org/1999/xhtml'
    && heading.ownerDocument === document && root.contains(heading) && heading.matches(headingSelector)
    && !heading.closest(protectedSelector);
  const report = (error: unknown): void => {
    if (!disposed) {
      try { status.textContent = message('ui.outline.error'); }
      catch { status.textContent = outlineUIMessages.en['ui.outline.error']; }
      status.hidden = false;
    }
    try { onError?.(error); }
    catch { /* Diagnostics cannot resurrect UI or prevent cleanup. */ }
  };
  const assertActive = (): void => { if (disposed) throw new Error('Outline UI has been destroyed.'); };
  const cancel = (): void => {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
  };
  const clear = (): void => {
    generation++;
    cancel();
    entries = [];
    list.replaceChildren();
  };
  const selected = (): void => {
    if (disposed) return;
    const selection = document.getSelection();
    const range = selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
    const current = owned() && range?.collapsed ? range.startContainer.nodeType === 1
      ? range.startContainer as Element : range.startContainer.parentElement : undefined;
    const heading = current?.closest(headingSelector);
    for (const entry of entries) {
      if (entry.revision === generation && heading === entry.heading && eligible(entry.heading)) entry.button.setAttribute('aria-current', 'location');
      else entry.button.removeAttribute('aria-current');
    }
  };
  const navigate = (entry: OutlineEntry, revision: number): void => {
    const current = (): boolean => !disposed && owned() && revision === generation
      && entries.includes(entry) && entry.button.isConnected && element.contains(entry.button) && eligible(entry.heading);
    if (!current()) return;
    try {
      editor.focus();
      if (!current()) return;
      const range = document.createRange();
      range.selectNodeContents(entry.heading);
      range.collapse(true);
      const selection = document.getSelection();
      if (!selection || !current()) return;
      selection.removeAllRanges();
      selection.addRange(range);
      if (!current()) return;
      entry.heading.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      if (current()) selected();
    }
    catch (error) { report(error); }
  };
  const render = (): void => {
    if (disposed) return;
    clear();
    if (!owned()) return;
    const revision = generation;
    try {
      const caption = label ?? message('ui.outline.label');
      const next: OutlineEntry[] = [];
      const fragment = document.createDocumentFragment();
      let truncated = false;
      for (const heading of root.querySelectorAll(headingSelector)) {
        if (!eligible(heading)) continue;
        if (next.length === maxHeadings) { truncated = true; break; }
        const item = document.createElement('li');
        const button = createUIButton(document);
        const raw = heading.textContent?.trim() ?? '';
        const text = !raw ? message('ui.outline.untitled') : raw.length > 300
          ? `${raw.slice(0, 299).replace(/[\ud800-\udbff]$/, '')}…` : raw;
        const level = heading.localName.slice(1);
        button.dataset.mwOutlineLevel = level;
        button.textContent = text;
        button.setAttribute('aria-label', `H${level}: ${text}`);
        item.append(button);
        fragment.append(item);
        next.push({ heading, button, revision });
      }
      if (disposed || !owned() || revision !== generation) return;
      entries = next;
      list.replaceChildren(fragment);
      element.setAttribute('aria-label', caption);
      status.textContent = message(!next.length ? 'ui.outline.empty' : 'ui.outline.truncated');
      status.hidden = next.length > 0 && !truncated;
      selected();
    }
    catch (error) { report(error); }
  };
  const schedule = (): void => {
    if (disposed) return;
    generation++;
    if (frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  };
  const observer = new view.MutationObserver(() => {
    if (disposed) return;
    if (!owned()) clear();
    else watch();
  });
  const watch = (): void => {
    observer.disconnect();
    const paths = new Set<Node>([host, element]);
    for (const leaf of [host, root]) {
      for (let node: Node | null = leaf.parentNode; node; node = node.parentNode) paths.add(node);
    }
    for (const node of paths) observer.observe(node, { childList: true });
  };
  const click = (event: MouseEvent): void => {
    if (disposed || event.defaultPrevented || !(event.target instanceof view.Element)) return;
    const button = event.target.closest('button');
    const entry = entries.find((candidate) => candidate.button === button);
    if (!entry) return;
    event.preventDefault();
    navigate(entry, entry.revision);
  };
  const listen = (owner: EventTarget, type: string, callback: EventListener): void => {
    owner.addEventListener(type, callback);
    cleanups.push(() => owner.removeEventListener(type, callback));
  };
  const refresh = (): void => { assertActive(); render(); };
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    clear();
    observer.disconnect();
    const failures: unknown[] = [];
    for (const cleanup of [...cleanups.splice(0).reverse(), () => element.remove()]) {
      try { cleanup(); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Outline cleanup failed.');
  };
  try {
    listen(element, 'click', click as EventListener);
    cleanups.push(editor.subscribe(schedule));
    cleanups.push(editor.events.on('selectionchange', selected));
    cleanups.push(editor.events.on('localechange', render));
    cleanups.push(editor.events.on('destroy', destroy));
    host.append(element);
    render();
    watch();
  }
  catch (error) {
    try { destroy(); }
    catch { /* Preserve the original setup error. */ }
    throw error;
  }
  return { element, refresh, destroy };
};
