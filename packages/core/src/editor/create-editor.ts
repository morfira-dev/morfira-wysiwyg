import { documentHTML, parseHTML, renderDocument, validateDocument } from '../document/index.js';
import { activeRange, bookmark, placeCaret, readTextSelection, restoreBookmark, selectText } from '../selection/index.js';
import type { SelectionBookmark } from '../selection/index.js';
import { editListInput, handlesListInput, indentList, listState, selectedBlocks } from '../lists/index.js';
import { applyFormat, inlineFormats, readFormats } from '../formatting/index.js';
import { inlineStyles, normalizeInlineStyle } from '../formatting/inline-attributes.js';
import { createEventHub } from '../events/index.js';
import type { EditorEvents } from '../events/types.js';
import type { Editor, EditorChange, EditorOptions, Snapshot } from './types.js';
import { createHTMLSnapshots } from './html-snapshots.js';
const ensureDocument = (root: HTMLElement): boolean => {
  let normalized = false;
  if (!root.childNodes.length) {
    root.innerHTML = '<p><br></p>';
    normalized = true;
  }
  // Native input can create loose inline nodes; wrap them in paragraphs without replacing text nodes.
  let paragraph: HTMLParagraphElement | undefined;
  for (const node of [...root.childNodes]) {
    const inline = node.nodeType === 3 || (node.nodeType === 1 && /^(strong|em|u|s|a|span|code|img|br|sub|sup)$/.test((node as Element).localName));
    if (inline) {
      if (!paragraph) {
        paragraph = document.createElement('p');
        root.insertBefore(paragraph, node);
      }
      paragraph.append(node);
      normalized = true;
    }
    else
      paragraph = undefined;
  }
  if (['table', 'figure'].includes(root.lastElementChild?.localName ?? ''))
    root.append(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
  root.dataset.empty = String(!root.textContent && !root.querySelector('table,img,hr'));
  return normalized;
};
const insertFragment = (root: HTMLElement, html: string): void => {
  const range = activeRange(root);
  if (!range)
    return;
  const fragment = renderDocument(parseHTML(html));
  if (!fragment.childNodes.length)
    return;
  range.deleteContents();
  const startElement = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const block = startElement?.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre');
  if (fragment.childNodes.length === 1 && fragment.firstChild instanceof HTMLParagraphElement && block) {
    const paragraph = fragment.firstChild;
    fragment.replaceChildren(...paragraph.childNodes);
  }
  const hasBlocks = [...fragment.childNodes].some((node) => node instanceof HTMLElement && /^(p|h[1-6]|ul|ol|table|figure|blockquote|pre)$/.test(node.localName));
  const last = fragment.lastChild!;
  if (hasBlocks && block && root.contains(block)) {
    const tailRange = document.createRange();
    tailRange.selectNodeContents(block);
    tailRange.setStart(range.startContainer, range.startOffset);
    const tail = block.cloneNode(false) as HTMLElement;
    tail.append(tailRange.extractContents());
    block.after(fragment);
    if (tail.textContent || tail.querySelector('img,br'))
      last.after(tail);
    if (!block.textContent && !block.querySelector('img'))
      block.remove();
  }
  else
    range.insertNode(fragment);
  const next = document.createRange();
  next.setStartAfter(last);
  next.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(next);
};
export const createEditor = (host: HTMLElement, options: EditorOptions = {}): Editor => {
  if (host.childNodes.length)
    throw new Error('Editor host must be empty. Pass initial HTML through value.');
  const plugins = options.plugins ?? [];
  if (new Set(plugins.map((plugin) => plugin.name)).size !== plugins.length)
    throw new Error('Duplicate editor plugin.');
  const limit = options.historyLimit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
    throw new RangeError('historyLimit must be an integer from 1 to 10000.');
  const initialDocument = parseHTML(options.value ?? '');
  const container = document.createElement('div');
  container.className = 'mw-editor';
  const surface = document.createElement('div');
  surface.className = 'mw-content';
  surface.setAttribute('role', 'textbox');
  surface.setAttribute('aria-multiline', 'true');
  surface.setAttribute('aria-label', options.label ?? 'Текстовый редактор');
  surface.dataset.placeholder = options.placeholder ?? 'Начните писать…';
  container.append(surface);
  host.append(container);
  surface.append(renderDocument(initialDocument));
  ensureDocument(surface);
  let destroyed = false;
  let readOnly = options.readOnly ?? false;
  let composing = false;
  let compositionStart: Snapshot | undefined;
  let pendingInput: Snapshot | undefined;
  let lastInputTime = 0;
  let lastInputType = '';
  let typingOverrides: Record<string, string | boolean> = {};
  let typingOffset: number | undefined;
  const clearTyping = () => { typingOverrides = {}; typingOffset = undefined; };
  const typingAtCaret = () => { const selection = readTextSelection(surface); return selection?.length === 0 && selection.index === typingOffset; };
  const undoStack: Snapshot[] = [];
  const redoStack: Snapshot[] = [];
  const eventHub = createEventHub();
  let transactionDepth = 0;
  let transactionFailed = false;
  let transactionError: unknown;
  let pendingSelectionNotification = false;
  const pluginAPIs = new Map<string, unknown>();
  const disposers: (() => void)[] = [];
  if (options.onChange)
    eventHub.events.on('change', options.onChange);
  const assertActive = () => {
    if (destroyed)
      throw new Error('Editor has been destroyed.');
  };
  const rejectDuringTransaction = (operation: string) => {
    if (!transactionDepth)
      return;
    const error = new Error(`${operation} is unavailable inside a transaction.`);
    transactionFailed = true;
    transactionError = error;
    throw error;
  };
  const events: EditorEvents = {
    on: eventHub.events.on,
    emit: (event, payload) => {
      assertActive();
      rejectDuringTransaction('events.emit');
      eventHub.events.emit(event, payload);
    },
  };
  const htmlSnapshots = createHTMLSnapshots(surface);
  const capture = (): Snapshot => ({ html: htmlSnapshots.read(), selection: bookmark(surface), ...(typingOffset !== undefined && Object.keys(typingOverrides).length && typingAtCaret() ? { typing: { offset: typingOffset, formats: { ...typingOverrides } } } : {}) });
  const restoreTyping = (snapshot: Snapshot) => {
    clearTyping();
    const selection = readTextSelection(surface);
    if (snapshot.typing && selection?.length === 0 && selection.index === snapshot.typing.offset) {
      typingOffset = snapshot.typing.offset;
      typingOverrides = { ...snapshot.typing.formats };
    }
  };
  let current = capture();
  let lastSelection = current.selection;
  const notifySelection = () => {
    if (destroyed)
      return;
    if (transactionDepth) {
      pendingSelectionNotification = true;
      return;
    }
    if (readTextSelection(surface) && !typingAtCaret())
      clearTyping();
    const saved = bookmark(surface);
    if (saved) {
      lastSelection = saved;
      current.selection = saved;
    }
    eventHub.notify('selectionchange', readTextSelection(surface));
  };
  const emit = (source: EditorChange['source']) => {
    const change: EditorChange = { html: editor.getHTML(), text: editor.getText(), source };
    const failures: unknown[] = [];
    try {
      eventHub.notify('change', change);
    }
    catch (error) {
      failures.push(error);
    }
    try {
      notifySelection();
    }
    catch (error) {
      failures.push(error);
    }
    if (failures.length)
      throw new AggregateError(failures, 'Editor change notification failed.');
  };
  const commitMutation = (before: Snapshot, inputType = ''): boolean => {
    const selection = readTextSelection(surface);
    if (ensureDocument(surface) && selection)
      selectText(surface, selection.index, selection.length);
    const after = capture();
    if (after.html === before.html) {
      current = after;
      return false;
    }
    const now = Date.now();
    const grouped = inputType === lastInputType && ['insertText', 'deleteContentBackward', 'deleteContentForward'].includes(inputType) && now - lastInputTime < 600 && before.selection && current.selection && JSON.stringify(before.selection) === JSON.stringify(current.selection);
    if (!grouped) {
      undoStack.push(before);
      if (undoStack.length > limit)
        undoStack.shift();
    }
    redoStack.length = 0;
    current = after;
    lastInputTime = inputType ? now : 0;
    lastInputType = inputType;
    return true;
  };
  const commit = (before: Snapshot, inputType = '') => {
    if (commitMutation(before, inputType))
      emit('user');
  };
  const restore = (snapshot: Snapshot) => {
    clearTyping();
    surface.innerHTML = snapshot.html;
    ensureDocument(surface);
    surface.focus({ preventScroll: true });
    restoreBookmark(surface, snapshot.selection);
    restoreTyping(snapshot);
    current = capture();
    lastSelection = current.selection;
    lastInputTime = 0;
    emit('user');
  };
  const runTransaction = (mutate: (surface: HTMLElement) => void, inputType = '') => {
    assertActive();
    if (readOnly)
      return;
    const invoke = () => {
      if (typeof mutate !== 'function' || mutate.constructor.name === 'AsyncFunction')
        throw new TypeError('Transactions require a synchronous callback.');
      const result: unknown = mutate(surface);
      if (result && (typeof result === 'object' || typeof result === 'function') && typeof (result as {
        then?: unknown;
      }).then === 'function') {
        if (result instanceof Promise)
          void result.catch(() => { });
        throw new TypeError('Transaction callbacks must not return a thenable.');
      }
    };
    if (transactionDepth) {
      transactionDepth++;
      try {
        invoke();
      }
      catch (error) {
        transactionFailed = true;
        transactionError = error;
        throw error;
      }
      finally {
        transactionDepth--;
      }
      return;
    }
    editor.focus();
    const before = capture();
    const previousUndo = [...undoStack];
    const previousRedo = [...redoStack];
    const previousInputTime = lastInputTime;
    const previousInputType = lastInputType;
    const previousPendingInput = pendingInput;
    const previousSelection = lastSelection;
    transactionDepth = 1;
    transactionFailed = false;
    transactionError = undefined;
    pendingSelectionNotification = false;
    let changed = false;
    try {
      invoke();
      if (transactionFailed)
        throw transactionError;
      changed = commitMutation(before, inputType);
    }
    catch (error) {
      surface.innerHTML = before.html;
      ensureDocument(surface);
      restoreBookmark(surface, before.selection);
      restoreTyping(before);
      current = capture();
      lastSelection = previousSelection;
      pendingInput = previousPendingInput;
      undoStack.splice(0, undoStack.length, ...previousUndo);
      redoStack.splice(0, redoStack.length, ...previousRedo);
      lastInputTime = previousInputTime;
      lastInputType = previousInputType;
      transactionDepth = 0;
      pendingSelectionNotification = false;
      throw error;
    }
    finally {
      transactionDepth = 0;
    }
    const selectionChanged = pendingSelectionNotification;
    pendingSelectionNotification = false;
    // Notifications are outside the rollback boundary: observers cannot undo a committed edit by throwing.
    if (changed)
      emit('user');
    else if (selectionChanged)
      notifySelection();
  };
  const editor: Editor = {
    element: container, surface, events,
    getHTML: () => { assertActive(); return htmlSnapshots.read(); },
    getText: () => { assertActive(); return surface.innerText; },
    getJSON: () => { assertActive(); return parseHTML(surface.innerHTML); },
    setHTML: (html) => {
      assertActive();
      rejectDuringTransaction('setHTML');
      const content = documentHTML(parseHTML(html));
      if (content === editor.getHTML())
        return;
      clearTyping();
      surface.innerHTML = content;
      ensureDocument(surface);
      undoStack.length = 0;
      redoStack.length = 0;
      lastInputTime = 0;
      lastSelection = undefined;
      current = capture();
      emit('api');
    },
    setJSON: (value) => {
      assertActive();
      rejectDuringTransaction('setJSON');
      const validated = validateDocument(value);
      editor.setHTML(documentHTML(validated));
    },
    getSelection: () => { assertActive(); return readTextSelection(surface); },
    setSelection: (index, length = 0) => { assertActive(); selectText(surface, index, length); notifySelection(); },
    getFormats: () => { assertActive(); return { ...readFormats(surface), ...(typingAtCaret() ? typingOverrides : {}) }; },
    setReadOnly: (value) => {
      assertActive();
      rejectDuringTransaction('setReadOnly');
      const changed = readOnly !== value;
      readOnly = value;
      surface.contentEditable = String(!value);
      surface.setAttribute('aria-readonly', String(value));
      container.dataset.readonly = String(value);
      const failures: unknown[] = [];
      if (changed) {
        try {
          eventHub.notify('readonlychange', value);
        }
        catch (error) {
          failures.push(error);
        }
      }
      try {
        notifySelection();
      }
      catch (error) {
        failures.push(error);
      }
      if (failures.length)
        throw new AggregateError(failures, 'Editor state notification failed.');
    },
    isReadOnly: () => { assertActive(); return readOnly; },
    format: (name, value) => {
      assertActive();
      if (readOnly)
        return;
      editor.focus();
      const selection = readTextSelection(surface);
      if (selection?.length === 0 && (Object.hasOwn(inlineFormats, name) || Object.hasOwn(inlineStyles, name))) {
        if (!typingAtCaret())
          clearTyping();
        typingOffset = selection.index;
        typingOverrides[name] = Object.hasOwn(inlineStyles, name) ? normalizeInlineStyle(name, value) : Boolean(value);
        notifySelection();
        return;
      }
      clearTyping();
      editor.transact(() => applyFormat(surface, name, value));
    },
    insertHTML: (html) => editor.transact(() => insertFragment(surface, html)),
    focus: () => {
      assertActive();
      surface.focus({ preventScroll: true });
      if (!activeRange(surface)) {
        if (lastSelection)
          restoreBookmark(surface, lastSelection);
        else
          placeCaret(surface.firstElementChild as HTMLElement ?? surface, true);
      }
    },
    undo: () => {
      assertActive();
      rejectDuringTransaction('undo');
      if (readOnly)
        return;
      const previous = undoStack.pop();
      if (previous) {
        redoStack.push(capture());
        restore(previous);
      }
    },
    redo: () => {
      assertActive();
      rejectDuringTransaction('redo');
      if (readOnly)
        return;
      const next = redoStack.pop();
      if (next) {
        undoStack.push(capture());
        restore(next);
      }
    },
    canUndo: () => { assertActive(); return undoStack.length > 0; },
    canRedo: () => { assertActive(); return redoStack.length > 0; },
    transact: (mutate) => runTransaction(mutate),
    providePlugin: (name, api) => {
      assertActive();
      if (pluginAPIs.has(name))
        throw new Error(`Plugin API already registered: ${name}`);
      pluginAPIs.set(name, api);
      return () => { pluginAPIs.delete(name); };
    },
    getPlugin: <T>(name: string) => { assertActive(); return pluginAPIs.get(name) as T | undefined; },
    subscribe: (listener) => { assertActive(); return eventHub.events.on('change', listener); },
    onSelectionChange: (listener) => { assertActive(); return eventHub.events.on('selectionchange', listener); },
    destroy: () => {
      if (destroyed)
        return;
      rejectDuringTransaction('destroy');
      destroyed = true;
      const failures: unknown[] = [];
      try {
        eventHub.destroy();
      }
      catch (error) {
        failures.push(error);
      }
      for (const dispose of disposers.reverse()) {
        try {
          dispose();
        }
        catch (error) {
          failures.push(error);
        }
      }
      pluginAPIs.clear();
      undoStack.length = 0;
      redoStack.length = 0;
      htmlSnapshots.clear();
      container.remove();
      if (failures.length)
        throw new AggregateError(failures, 'Editor cleanup failed.');
    },
  };
  const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
    surface.addEventListener(type, handler);
    disposers.push(() => surface.removeEventListener(type, handler));
  };
  listen('beforeinput', (event) => {
    if (readOnly) {
      event.preventDefault();
      return;
    }
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault();
      if (event.inputType === 'historyUndo')
        editor.undo();
      else
        editor.redo();
      return;
    }
    if (!composing && !event.isComposing && handlesListInput(surface, event.inputType)) {
      event.preventDefault();
      clearTyping();
      pendingInput = undefined;
      runTransaction(() => editListInput(surface, event.inputType));
      return;
    }
    if (event.inputType === 'insertText' && event.data && !composing && !event.isComposing && typingAtCaret() && Object.keys(typingOverrides).length) {
      event.preventDefault();
      const start = readTextSelection(surface)!.index;
      const text = event.data;
      const overrides = { ...typingOverrides };
      runTransaction(() => {
        const range = activeRange(surface)!;
        const parent = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        const block = parent?.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre');
        if (block && !block.textContent && block.childNodes.length === 1 && block.firstChild instanceof HTMLBRElement) {
          block.replaceChildren();
          range.selectNodeContents(block);
          range.collapse(true);
        }
        range.insertNode(document.createTextNode(text));
        selectText(surface, start, text.length);
        for (const [name, enabled] of Object.entries(overrides))
          if ((Object.hasOwn(inlineStyles, name) ? readFormats(surface)[name] ?? false : Boolean(readFormats(surface)[name])) !== enabled)
            applyFormat(surface, name, enabled);
        selectText(surface, start + text.length);
        typingOffset = start + text.length;
      }, 'insertText');
      pendingInput = undefined;
      return;
    }
    pendingInput = capture();
  });
  listen('input', (nativeEvent) => {
    const event = nativeEvent as InputEvent;
    if (readOnly) {
      surface.innerHTML = current.html;
      return;
    }
    if (composing || event.isComposing)
      return;
    const before = pendingInput ?? current;
    pendingInput = undefined;
    commit(before, event.inputType);
  });
  listen('compositionstart', () => { clearTyping(); composing = true; compositionStart = capture(); });
  listen('compositionend', () => {
    composing = false;
    const before = compositionStart;
    compositionStart = undefined;
    pendingInput = undefined;
    if (before)
      commit(before);
  });
  listen('paste', (event) => {
    event.preventDefault();
    if (readOnly || !event.clipboardData)
      return;
    editor.focus();
    const html = event.clipboardData.getData('text/html');
    if (html)
      editor.insertHTML(html);
    else {
      const text = event.clipboardData.getData('text/plain');
      const holder = document.createElement('div');
      holder.textContent = text;
      editor.insertHTML(holder.innerHTML.replace(/\r?\n/g, '<br>'));
    }
  });
  listen('drop', (event) => { event.preventDefault(); });
  listen('keydown', (event) => {
    if (!composing && !event.isComposing && !readOnly && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'Enter' || event.key === 'Backspace')) {
      const type = event.key === 'Backspace' ? 'deleteContentBackward' : event.shiftKey ? 'insertLineBreak' : 'insertParagraph';
      if (handlesListInput(surface, type)) {
        event.preventDefault();
        clearTyping();
        pendingInput = undefined;
        runTransaction(() => editListInput(surface, type));
        return;
      }
    }
    if (!composing && !event.isComposing && !readOnly && event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const blocks = selectedBlocks(surface);
      if (blocks.length && blocks.every((block) => block.localName === 'li' && !block.closest('td,th')) && listState(surface).canOutdent) {
        event.preventDefault();
        clearTyping();
        runTransaction(() => indentList(surface, event.shiftKey ? -1 : 1));
        return;
      }
    }
    if (composing || event.isComposing || readOnly || !(event.ctrlKey || event.metaKey) || event.altKey)
      return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      event.preventDefault();
      if (key === 'y' || event.shiftKey)
        editor.redo();
      else
        editor.undo();
    }
    const name = ({ b: 'bold', i: 'italic', u: 'underline' } as Record<string, string>)[key];
    if (name) {
      event.preventDefault();
      editor.format(name, (editor.getFormats().mixed as string[] | undefined)?.includes(name) || !editor.getFormats()[name]);
    }
  });
  document.addEventListener('selectionchange', notifySelection);
  disposers.push(() => document.removeEventListener('selectionchange', notifySelection));
  try {
    editor.setReadOnly(readOnly);
    for (const plugin of plugins) {
      const dispose = plugin.setup(editor);
      if (dispose)
        disposers.push(dispose);
    }
    return editor;
  }
  catch (error) {
    editor.destroy();
    throw error;
  }
};
