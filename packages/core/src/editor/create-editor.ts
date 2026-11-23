import { semanticPresentationTarget } from '../positions/presentation.js';
import { createPositionRegistry } from '../positions/index.js';
import { prepareTextMapping, inverseTextMapping } from '../positions/mapping.js';
import type { PreparedTextMapping } from '../positions/internal-types.js';
import type { EditorTransactionOptions } from '../positions/types.js';
import { createSelectionHandleRegistry } from '../selection/handles/index.js';
import { createDocumentSchema } from '../schema/index.js';
import { createCommandRegistry } from '../commands/index.js';
import { activeRange, bookmark, placeCaret, rangeFromBookmark, readTextSelection, restoreBookmark, selectText } from '../selection/index.js';
import type { SelectionBookmark } from '../selection/index.js';
import {
  editListInput, handlesListInput, indentList, listState, selectedBlocks,
  listSelectionReplacement, prepareListSelectionPaste, replaceListSelection,
  replaceListSelectionWithFragment, handlesListForwardDelete, editListForwardDelete,
  handlesCollapsedListBlockPaste,
  inspectWrappedListInput, editWrappedListInput,
} from '../lists/index.js';
import { editBlockInput, handlesBlockInput, handlesSelectionReplacement, replaceSelection, prepareSelectionPaste, replaceSelectionWithFragment } from '../input/index.js';
import { applyFormat, inlineFormats, readFormats } from '../formatting/index.js';
import { inlineStyles, normalizeInlineStyle } from '../formatting/inline-attributes.js';
import { createEventHub } from '../events/index.js';
import type { EditorEvents, EditorInputCommit } from '../events/types.js';
import type { Editor, EditorChange, EditorOptions, Snapshot } from './types.js';
import type { InputCommitOrigin } from './internal-types.js';
import { createHTMLSnapshots } from './html-snapshots.js';
import { createLocale, editorMessages, localize } from '../localization/index.js';
const paragraphOrigin = (event: Event, inputType: string): InputCommitOrigin | undefined => event.cancelable && inputType === 'insertParagraph' ? { inputType, sourceEvent: event } : undefined;
const isCompositionInput = (event: InputEvent): boolean => event.isComposing || event.inputType === 'insertCompositionText' || event.inputType === 'insertFromComposition' || event.inputType === 'deleteCompositionText';
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
const insertFragment = (root: HTMLElement, fragment: DocumentFragment): void => {
  const range = activeRange(root);
  if (!range)
    return;
  if (!fragment.childNodes.length)
    return;
  if (replaceSelectionWithFragment(root, fragment)) return;
  if (replaceListSelectionWithFragment(root, fragment)) return;
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
  // Capture a stable text boundary before history serializes adjacent/empty Text nodes.
  if (!hasBlocks && block && root.contains(block)) block.normalize();
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
  const schema = createDocumentSchema([...(options.schema ?? []), ...plugins.flatMap((plugin) => plugin.schema ?? [])]);
  const prepareListSplit = (item: HTMLLIElement): void => {
    const attributes = Object.fromEntries([...item.attributes].map(({ name, value }) => [name, value]));
    for (const [name, value] of Object.entries(schema.attributesForSplit('li', attributes))) item.setAttribute(name, value);
  };
  const initialDocument = schema.parseHTML(options.value ?? '');
  let locale = createLocale(options.locale ?? 'ru', options.translations);
  const container = document.createElement('div');
  container.className = 'mw-editor';
  const surface = document.createElement('div');
  surface.className = 'mw-content';
  surface.setAttribute('role', 'textbox');
  surface.setAttribute('aria-multiline', 'true');
  const updateLocale = () => {
    surface.setAttribute('aria-label', options.label ?? localize(locale, 'editor.label', editorMessages));
    surface.dataset.placeholder = options.placeholder ?? localize(locale, 'editor.placeholder', editorMessages);
  };
  updateLocale();
  container.append(surface);
  host.append(container);
  surface.append(schema.renderDocument(initialDocument));
  ensureDocument(surface);
  let destroyed = false;
  let readOnly = options.readOnly ?? false;
  let composing = false;
  let compositionStart: Snapshot | undefined;
  let canceledComposition = false;
  let compositionTail: Snapshot | undefined;
  let compositionUndoRecorded = false;
  let pendingInput: Snapshot | undefined;
  let lastInputTime = 0;
  let lastInputType = '';
  let typingOverrides: Record<string, string | boolean> = {};
  let typingOffset: number | undefined;
  const clearTyping = () => { typingOverrides = {}; typingOffset = undefined; };
  const typingAtCaret = () => {
    if (typingOffset === undefined) return false;
    const selection = readTextSelection(surface);
    return selection?.length === 0 && selection.index === typingOffset;
  };
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
  const htmlSnapshots = createHTMLSnapshots(surface, schema.sanitizeHTML);
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
  const selectionHandles = createSelectionHandleRegistry({
    surface,
    isAvailable: () => !destroyed && !composing && !pendingInput,
    canRestore: () => !transactionDepth,
    // Normalize only at capture; queries never serialize the document. Runtime
    // presentation attributes need not match the persisted document snapshot.
    canCapture: () => {
      if (transactionDepth)
        return false;
      try {
        return htmlSnapshots.read() === current.html;
      }
      catch {
        return false;
      }
    },
  });
  const positionHistory = new WeakMap<Snapshot, PreparedTextMapping>();
  const positionRegistry = createPositionRegistry({
    surface,
    canPresent: (node) => semanticPresentationTarget(surface, schema, node),
    isAvailable: () => !destroyed && !composing && !transactionDepth && !pendingInput,
    canCapture: () => {
      try { return htmlSnapshots.read() === current.html; }
      catch { return false; }
    },
  });
  let lastSelection = current.selection;
  const clearCompositionTail = () => {
    compositionTail = undefined;
    compositionUndoRecorded = false;
  };
  const cancelComposition = (rollback: boolean) => {
    const before = compositionStart;
    canceledComposition = canceledComposition || composing || compositionTail !== undefined;
    composing = false;
    compositionStart = undefined;
    pendingInput = undefined;
    clearCompositionTail();
    if (rollback && before) {
      positionRegistry.invalidate();
      surface.innerHTML = before.html;
      ensureDocument(surface);
      restoreBookmark(surface, before.selection);
      restoreTyping(before);
      current = capture();
      selectionHandles.invalidate();
      selectionHandles.synchronize();
      lastSelection = current.selection;
    }
  };
  const restoreCurrentDOM = () => {
    positionRegistry.invalidate();
    selectionHandles.invalidate();
    surface.innerHTML = current.html;
    ensureDocument(surface);
    restoreBookmark(surface, current.selection);
    selectionHandles.synchronize();
    positionRegistry.synchronize();
    positionRegistry.notify();
  };
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
      positionRegistry.notify();
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
  const commitMutation = (before: Snapshot, inputType = '', mapping?: PreparedTextMapping): boolean => {
    const selection = readTextSelection(surface);
    if (ensureDocument(surface) && selection)
      selectText(surface, selection.index, selection.length);
    const after = capture();
    if (mapping && mapping.after !== (surface.textContent ?? ''))
      throw new Error('Mapping does not match the edited text.');
    selectionHandles.synchronize();
    if (after.html === before.html) {
      positionRegistry.synchronize();
      current = after;
      return false;
    }
    selectionHandles.invalidate();
    const now = Date.now();
    const grouped = inputType === lastInputType && ['insertText', 'deleteContentBackward', 'deleteContentForward'].includes(inputType) && now - lastInputTime < 600 && before.selection && current.selection && JSON.stringify(before.selection) === JSON.stringify(current.selection);
    if (!grouped) {
      undoStack.push(before);
      if (undoStack.length > limit)
        undoStack.shift();
    }
    redoStack.length = 0;
    if (mapping) positionHistory.set(before, mapping);
    positionRegistry.accept(mapping);
    current = after;
    lastInputTime = inputType ? now : 0;
    lastInputType = inputType;
    return true;
  };
  const commit = (before: Snapshot, inputType = '') => {
    if (commitMutation(before, inputType))
      emit('user');
  };
  const restore = (snapshot: Snapshot, mapping?: PreparedTextMapping) => {
    positionRegistry.synchronize();
    const beforeText = surface.textContent ?? '';
    selectionHandles.invalidate();
    clearTyping();
    surface.innerHTML = snapshot.html;
    ensureDocument(surface);
    surface.focus({ preventScroll: true });
    restoreBookmark(surface, snapshot.selection);
    restoreTyping(snapshot);
    current = capture();
    selectionHandles.synchronize();
    positionRegistry.accept(mapping && mapping.before === beforeText && mapping.after === (surface.textContent ?? '') ? mapping : undefined);
    lastSelection = current.selection;
    lastInputTime = 0;
    emit('user');
  };
  const notifyCommittedInput = (origin: InputCommitOrigin): void => {
    const committed = current;
    const selection = bookmark(surface);
    const selectionKey = JSON.stringify(selection);
    const typingKey = JSON.stringify(typingAtCaret() ? [typingOffset, typingOverrides] : []);
    const receipt: EditorInputCommit = {
      ...origin,
      selection,
      isCurrent: () => !destroyed && !readOnly && !composing && current === committed
        && JSON.stringify(bookmark(surface)) === selectionKey
        && JSON.stringify(typingAtCaret() ? [typingOffset, typingOverrides] : []) === typingKey,
    };
    const failures: unknown[] = [];
    try {
      emit('user');
    }
    catch (error) {
      failures.push(error);
    }
    try {
      eventHub.notify('inputcommit', receipt);
    }
    catch (error) {
      failures.push(error);
    }
    if (failures.length) throw new AggregateError(failures, 'Input commit notification failed.');
  };
  const runTransaction = (mutate: (surface: HTMLElement) => void, inputType = '', origin?: InputCommitOrigin, transactionOptions?: EditorTransactionOptions) => {
    assertActive();
    if (readOnly || composing)
      return;
    clearCompositionTail();
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
      if (transactionOptions !== undefined) {
        const error = new Error('Nested mapping plans are not supported.');
        transactionFailed = true;
        transactionError = error;
        throw error;
      }
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
    const beforeFocus = current;
    editor.focus();
    // Application focus callbacks may commit a replacement, revoke editing or
    // destroy the instance. Never run an old operation against that newer state.
    if (destroyed || readOnly || composing || current !== beforeFocus) return;
    positionRegistry.synchronize();
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
      if (transactionOptions !== undefined && (!transactionOptions || typeof transactionOptions !== 'object'
        || Array.isArray(transactionOptions) || Object.keys(transactionOptions).some((key) => key !== 'mapping')))
        throw new TypeError('Unsupported transaction options.');
      const mapping = transactionOptions?.mapping === undefined ? undefined
        : prepareTextMapping(transactionOptions.mapping, surface.textContent ?? '');
      // A replacement can return to the old text offset without a selectionchange flush.
      const initialRange = activeRange(surface);
      if (initialRange && !initialRange.collapsed) clearTyping();
      invoke();
      if (transactionFailed)
        throw transactionError;
      changed = commitMutation(before, inputType, mapping);
    }
    catch (error) {
      positionRegistry.invalidate();
      positionRegistry.synchronize();
      selectionHandles.invalidate();
      surface.innerHTML = before.html;
      ensureDocument(surface);
      restoreBookmark(surface, before.selection);
      restoreTyping(before);
      current = capture();
      selectionHandles.synchronize();
      lastSelection = previousSelection;
      pendingInput = previousPendingInput;
      undoStack.splice(0, undoStack.length, ...previousUndo);
      redoStack.splice(0, redoStack.length, ...previousRedo);
      lastInputTime = previousInputTime;
      lastInputType = previousInputType;
      transactionDepth = 0;
      pendingSelectionNotification = false;
      try { positionRegistry.notify(); }
      catch (notificationError) { throw new AggregateError([error, notificationError], 'Transaction cleanup failed.'); }
      throw error;
    }
    finally {
      transactionDepth = 0;
    }
    const selectionChanged = pendingSelectionNotification;
    pendingSelectionNotification = false;
    // Notifications are outside the rollback boundary: observers cannot undo a committed edit by throwing.
    if (changed) {
      if (origin) notifyCommittedInput(origin);
      else emit('user');
    }
    else {
      positionRegistry.notify();
      if (selectionChanged) notifySelection();
    }
  };
  const registry = createCommandRegistry({ editor: () => editor, isComposing: () => composing, assertActive });
  const prepareHTML = (html: string): DocumentFragment => {
    try {
      const fragment = schema.renderDocument(schema.parseHTML(html));
      const range = activeRange(surface) ?? rangeFromBookmark(surface, lastSelection);
      prepareSelectionPaste(surface, fragment, range);
      prepareListSelectionPaste(surface, fragment, range);
      return fragment;
    }
    catch (error) {
      // Invalid nested imports poison the outer edit even when its caller catches them.
      if (transactionDepth) {
        transactionFailed = true;
        transactionError = error;
      }
      throw error;
    }
  };
  const insertPrepared = (fragment: DocumentFragment, origin?: InputCommitOrigin): void => {
    if (!fragment.childNodes.length) return;
    if (!activeRange(surface) && lastSelection) restoreBookmark(surface, lastSelection);
    runTransaction(() => {
      // Replacement or a new list body changes the caret's formatting context,
      // even at the same text offset. Capture the original snapshot first.
      const range = activeRange(surface);
      if (range && (!range.collapsed || handlesCollapsedListBlockPaste(surface, fragment, range))) clearTyping();
      insertFragment(surface, fragment);
    }, '', origin);
  };
  const editor: Editor = {
    element: container, surface, events, schema, commands: registry.commands, selection: selectionHandles.selection, positions: positionRegistry.positions,
    getLocale: () => {
      assertActive();
      return { locale: locale.locale, translations: { ...locale.translations } };
    },
    setLocale: (language, translations) => {
      assertActive();
      rejectDuringTransaction('setLocale');
      const next = createLocale(language, translations);
      const keys = Object.keys(next.translations);
      if (locale.locale === next.locale && keys.length === Object.keys(locale.translations).length && keys.every((key) => Object.hasOwn(locale.translations, key) && locale.translations[key] === next.translations[key]))
        return;
      locale = next;
      updateLocale();
      eventHub.notify('localechange', editor.getLocale());
    },
    getHTML: () => { assertActive(); return htmlSnapshots.read(); },
    getText: () => { assertActive(); return surface.innerText; },
    getJSON: () => { assertActive(); return schema.parseHTML(surface.innerHTML); },
    setHTML: (html) => {
      assertActive();
      rejectDuringTransaction('setHTML');
      const content = schema.documentHTML(schema.parseHTML(html));
      if (content === editor.getHTML())
        return;
      cancelComposition(false);
      positionRegistry.invalidate();
      positionRegistry.synchronize();
      selectionHandles.invalidate();
      clearTyping();
      surface.innerHTML = content;
      ensureDocument(surface);
      undoStack.length = 0;
      redoStack.length = 0;
      lastInputTime = 0;
      lastSelection = undefined;
      current = capture();
      selectionHandles.synchronize();
      emit('api');
    },
    setJSON: (value) => {
      assertActive();
      rejectDuringTransaction('setJSON');
      const validated = schema.validateDocument(value);
      editor.setHTML(schema.documentHTML(validated));
    },
    getSelection: () => { assertActive(); return readTextSelection(surface); },
    setSelection: (index, length = 0) => { assertActive(); selectText(surface, index, length); notifySelection(); },
    getFormats: (range) => {
      assertActive();
      return range === undefined ? { ...readFormats(surface), ...(typingAtCaret() ? typingOverrides : {}) } : readFormats(surface, range);
    },
    setReadOnly: (value) => {
      assertActive();
      rejectDuringTransaction('setReadOnly');
      const changed = readOnly !== value;
      if (changed && value)
        cancelComposition(true);
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
      if (readOnly || composing)
        return;
      clearCompositionTail();
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
      editor.transact(() => applyFormat(surface, name, value, schema));
    },
    insertHTML: (html) => {
      assertActive();
      if (readOnly || composing) return;
      insertPrepared(prepareHTML(html));
    },
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
      if (readOnly || composing)
        return;
      clearCompositionTail();
      const previous = undoStack.pop();
      if (previous) {
        const mapping = positionHistory.get(previous);
        const present = capture();
        if (mapping) positionHistory.set(present, mapping);
        redoStack.push(present);
        restore(previous, mapping ? inverseTextMapping(mapping) : undefined);
      }
    },
    redo: () => {
      assertActive();
      rejectDuringTransaction('redo');
      if (readOnly || composing)
        return;
      clearCompositionTail();
      const next = redoStack.pop();
      if (next) {
        const mapping = positionHistory.get(next);
        const present = capture();
        if (mapping) positionHistory.set(present, mapping);
        undoStack.push(present);
        restore(next, mapping);
      }
    },
    canUndo: () => { assertActive(); return undoStack.length > 0; },
    canRedo: () => { assertActive(); return redoStack.length > 0; },
    transact: (mutate, transactionOptions) => runTransaction(mutate, '', undefined, transactionOptions),
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
      cancelComposition(false);
      destroyed = true;
      selectionHandles.destroy();
      positionRegistry.destroy();
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
      registry.destroy();
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
    if (event.defaultPrevented)
      return;
    if (readOnly) {
      event.preventDefault();
      return;
    }
    const compositionInput = isCompositionInput(event);
    if (canceledComposition && compositionInput) {
      event.preventDefault();
      return;
    }
    if (composing || event.isComposing)
      return;
    if (!compositionInput) {
      canceledComposition = false;
      clearCompositionTail();
    }
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault();
      if (event.inputType === 'historyUndo')
        editor.undo();
      else
        editor.redo();
      return;
    }
    if (event.cancelable && handlesSelectionReplacement(surface, event.inputType, event.data)) {
      event.preventDefault();
      clearTyping();
      pendingInput = undefined;
      const text = event.inputType === 'insertText' ? event.data! : '';
      // A replacement is isolated from native typing/deletion bursts on both sides.
      runTransaction(() => replaceSelection(surface, text));
      return;
    }
    const listReplacementInput = (event.inputType === 'insertText' && typeof event.data === 'string')
      || event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward';
    if (event.cancelable && listReplacementInput) {
      const selection = listSelectionReplacement(surface);
      if (selection.status !== 'unowned') {
        event.preventDefault();
        pendingInput = undefined;
        if (selection.status === 'blocked') return;
        clearTyping();
        runTransaction(() => replaceListSelection(surface, event.inputType === 'insertText' ? event.data! : ''));
        return;
      }
    }
    if (event.cancelable && handlesListForwardDelete(surface, event.inputType)) {
      event.preventDefault();
      pendingInput = undefined;
      runTransaction(() => {
        // A boundary barrier is a real no-op, including pending caret formats.
        if (editListForwardDelete(surface)) clearTyping();
      });
      return;
    }
    const wrappedInput = inspectWrappedListInput(surface, event.inputType);
    if (wrappedInput === 'eligible' || wrappedInput === 'blocked') {
      if (!event.cancelable) {
        // Native default cannot be suppressed; do not also run legacy list edits.
        pendingInput = capture();
        return;
      }
      event.preventDefault();
      pendingInput = undefined;
      if (wrappedInput === 'blocked') return;
      runTransaction(() => {
        if (editWrappedListInput(surface, event.inputType, prepareListSplit)) clearTyping();
      }, '', paragraphOrigin(event, event.inputType));
      return;
    }
    if (!composing && !event.isComposing && handlesListInput(surface, event.inputType)) {
      event.preventDefault();
      clearTyping();
      pendingInput = undefined;
      runTransaction(() => editListInput(surface, event.inputType, prepareListSplit), '', paragraphOrigin(event, event.inputType));
      return;
    }
    if (handlesBlockInput(surface, event.inputType)) {
      event.preventDefault();
      clearTyping();
      pendingInput = undefined;
      runTransaction(() => editBlockInput(surface, event.inputType), '', paragraphOrigin(event, event.inputType));
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
            applyFormat(surface, name, enabled, schema);
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
    const compositionInput = isCompositionInput(event);
    if (readOnly || (canceledComposition && compositionInput)) {
      restoreCurrentDOM();
      return;
    }
    if (composing || event.isComposing)
      return;
    if (compositionTail && compositionInput) {
      const before = compositionTail;
      const changed = htmlSnapshots.read() !== current.html;
      pendingInput = undefined;
      if (!changed)
        return;
      // Replace only our own last undo entry, never an intervening application edit.
      if (compositionUndoRecorded && undoStack.at(-1) === before)
        undoStack.pop();
      compositionUndoRecorded = commitMutation(before);
      emit('user');
      return;
    }
    canceledComposition = false;
    clearCompositionTail();
    const before = pendingInput ?? current;
    pendingInput = undefined;
    commit(before, event.inputType);
  });
  listen('compositionstart', () => {
    positionRegistry.invalidate();
    selectionHandles.invalidate();
    if (readOnly) {
      canceledComposition = true;
      positionRegistry.notify();
      return;
    }
    if (composing) {
      positionRegistry.notify();
      return;
    }
    clearTyping();
    clearCompositionTail();
    pendingInput = undefined;
    canceledComposition = false;
    compositionStart = capture();
    composing = true;
    positionRegistry.notify();
  });
  listen('compositionend', () => {
    if (canceledComposition) {
      pendingInput = undefined;
      restoreCurrentDOM();
      return;
    }
    composing = false;
    const before = compositionStart;
    compositionStart = undefined;
    pendingInput = undefined;
    if (before) {
      compositionTail = before;
      compositionUndoRecorded = commitMutation(before);
      if (compositionUndoRecorded)
        emit('user');
    }
  });
  listen('paste', (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (readOnly || composing || !event.clipboardData)
      return;
    let html = event.clipboardData.getData('text/html');
    if (!html) {
      const text = event.clipboardData.getData('text/plain');
      const holder = document.createElement('div');
      holder.textContent = text;
      html = holder.innerHTML.replace(/\r\n?|\n/g, '<br>');
    }
    let fragment: DocumentFragment;
    try { fragment = prepareHTML(html); }
    catch { return; }
    // Commit/observer failures deliberately stay outside the import-only catch.
    insertPrepared(fragment, event.cancelable ? { inputType: 'insertFromPaste', sourceEvent: event } : undefined);
  });
  listen('drop', (event) => { event.preventDefault(); });
  listen('keydown', (event) => {
    if (event.defaultPrevented || event.keyCode === 229)
      return;
    if (!composing && !event.isComposing && !readOnly && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete')) {
      const type = event.key === 'Backspace' ? 'deleteContentBackward' : event.key === 'Delete' ? 'deleteContentForward' : event.shiftKey ? 'insertLineBreak' : 'insertParagraph';
      const wrappedInput = inspectWrappedListInput(surface, type);
      const listReplacement = type === 'deleteContentBackward' || type === 'deleteContentForward'
        ? listSelectionReplacement(surface).status !== 'unowned' : false;
      const listOwned = listReplacement || wrappedInput === 'eligible' || wrappedInput === 'blocked'
        || handlesListForwardDelete(surface, type);
      if (listOwned && event.cancelable) {
        // Some native protocols omit boundary beforeinput or mislabel Shift+Enter.
        // Keep one normalized, cancelable input path for core and plugin capture hooks.
        event.preventDefault();
        surface.dispatchEvent(new InputEvent('beforeinput', { inputType: type, bubbles: true, cancelable: true }));
        return;
      }
      if (!listOwned && handlesListInput(surface, type)) {
        event.preventDefault();
        clearTyping();
        pendingInput = undefined;
        runTransaction(() => editListInput(surface, type, prepareListSplit), '', paragraphOrigin(event, type));
        return;
      }
      // Enter must reach beforeinput so optional typing rules can consume it first.
      if (!listOwned && (event.key !== 'Enter' || event.shiftKey) && handlesBlockInput(surface, type)) {
        event.preventDefault();
        clearTyping();
        pendingInput = undefined;
        runTransaction(() => editBlockInput(surface, type));
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
