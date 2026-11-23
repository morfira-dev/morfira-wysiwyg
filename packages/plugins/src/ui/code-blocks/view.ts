import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { codeBlockCommands } from '../../code-blocks/index.js';
import { codeBlockMessages } from './messages.js';
import type { CodeBlockViewRecord } from './internal-types.js';
import type { CodeBlockViewController, CodeBlockViewOptions, CodeHighlightToken } from './types.js';
const tokenKinds = new Set(['keyword', 'string', 'number', 'comment', 'operator', 'punctuation', 'type']);
const checkedTokens = (value: readonly CodeHighlightToken[], length: number): readonly CodeHighlightToken[] => {
  if (!Array.isArray(value) || value.length > 4096) throw new TypeError('Highlight tokens require a bounded array.');
  let previous = 0;
  return value.map((token) => {
    if (!token || typeof token !== 'object' || Object.keys(token).some((key) => !['from', 'to', 'kind'].includes(key))
      || !Number.isInteger(token.from) || !Number.isInteger(token.to) || token.from < previous
      || token.to <= token.from || token.to > length || !tokenKinds.has(token.kind))
      throw new TypeError('Highlight ranges must be ordered, disjoint source offsets with known token kinds.');
    previous = token.to;
    return { from: token.from, to: token.to, kind: token.kind };
  });
};

/** Highlight provider results are inert ranges; source remains outside callback-created HTML. */
export const createCodeBlockView = (host: HTMLElement, editor: Editor, options: CodeBlockViewOptions = {}): CodeBlockViewController => {
  const root = editor.surface;
  const document = root.ownerDocument;
  if (host.ownerDocument !== document || !host.isConnected || host.contains(root) || root.contains(host)) throw new Error('Code views require a separate host.');
  if (options.highlight !== undefined && typeof options.highlight !== 'function'
    || options.onError !== undefined && typeof options.onError !== 'function') throw new TypeError('Code view callbacks must be functions.');
  const highlight = options.highlight;
  const onError = options.onError;
  const ownsHost = () => host.ownerDocument === document && host.isConnected
    && !root.contains(host) && !host.contains(root);
  const commands = codeBlockCommands(editor);
  const views = new Map<HTMLElement, CodeBlockViewRecord>();
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let refreshing = false;
  const remove = (target: HTMLElement) => {
    const view = views.get(target);
    if (!view) return;
    views.delete(target);
    view.request?.abort();
    view.element.remove();
  };
  const render = (target: HTMLElement, view: CodeBlockViewRecord) => {
    view.request?.abort();
    const request = new AbortController();
    view.request = request;
    const source = view.source;
    const language = view.language;
    view.code.textContent = source;
    view.element.removeAttribute('data-highlight-error');
    view.element.removeAttribute('title');
    if (!highlight) return;
    const current = () => {
      if (!ownsHost()) { destroy(); return false; }
      return !disposed && !request.signal.aborted && views.get(target) === view
        && commands.get(target)?.source === source && commands.get(target)?.language === language;
    };
    Promise.resolve().then(() => {
      if (!current()) return;
      return highlight({ source, language, signal: request.signal });
    }).then((result) => {
      if (!current() || result === undefined) return;
      const tokens = checkedTokens(result, source.length);
      if (!current()) return;
      const fragment = document.createDocumentFragment();
      let offset = 0;
      for (const token of tokens) {
        fragment.append(document.createTextNode(source.slice(offset, token.from)));
        const span = document.createElement('span');
        span.className = `mw-code-token-${token.kind}`;
        span.textContent = source.slice(token.from, token.to);
        fragment.append(span);
        offset = token.to;
      }
      fragment.append(document.createTextNode(source.slice(offset)));
      view.code.replaceChildren(fragment);
    }).catch((error: unknown) => {
      if (!current()) return;
      view.code.textContent = source;
      view.element.dataset.highlightError = '';
      view.element.title = localize(editor.getLocale(), 'ui.code.highlightFailed', codeBlockMessages);
      try { onError?.(error); }
      catch { /* Application error reporting must not leave an unhandled provider rejection. */ }
    });
  };
  const refresh = () => {
    if (disposed || refreshing) return;
    if (!ownsHost()) { destroy(); return; }
    refreshing = true;
    try {
      const nodes = [...root.querySelectorAll<HTMLElement>('pre[data-mw-node="morfira:code-block"]')].filter((node) => !!commands.get(node));
      if (nodes.length > 2048) throw new RangeError('Too many code views.');
      for (const node of [...views.keys()]) if (!nodes.includes(node)) remove(node);
      for (const target of nodes) {
        const value = commands.get(target)!;
        let view = views.get(target);
        if (!view) {
          const element = document.createElement('pre');
          element.className = 'mw-code-view';
          const code = document.createElement('code');
          element.append(code);
          view = { element, code, source: value.source, language: value.language };
          views.set(target, view);
          host.append(element);
          render(target, view);
        }
        else if (view.source !== value.source || view.language !== value.language) {
          view.source = value.source;
          view.language = value.language;
          render(target, view);
        }
        view.element.setAttribute('aria-label', `${localize(editor.getLocale(), 'ui.code.preview', codeBlockMessages)}: ${value.language}`);
        if (view.element.hasAttribute('data-highlight-error'))
          view.element.title = localize(editor.getLocale(), 'ui.code.highlightFailed', codeBlockMessages);
      }
    }
    finally { refreshing = false; }
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups) cleanup();
    for (const target of [...views.keys()]) remove(target);
  };
  try {
    refresh();
    cleanups.push(editor.subscribe(refresh), editor.events.on('localechange', refresh), editor.events.on('destroy', destroy));
  }
  catch (error) { destroy(); throw error; }
  return { refresh, destroy };
};
