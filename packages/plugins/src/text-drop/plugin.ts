import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { containsPoint, dropRange, editorOwned, flowAt, normalizeFlow, selectRange, validDragTarget, restoreDropCaret } from './target.js';
import { hasFiles, hasText, payloadFromRange, privateDragType, readPayload } from './payload.js';
import type { DragSession } from './internal-types.js';
import type { TextDropCommands, TextDropOptions } from './types.js';

const checkedOptions = (input: TextDropOptions): Required<Pick<TextDropOptions, 'enabled'>> & Pick<TextDropOptions, 'onError'> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    || Reflect.ownKeys(input).some((key) => key !== 'enabled' && key !== 'onError'))
    throw new TypeError('Expected text drop options.');
  const { enabled = true, onError } = input;
  if (typeof enabled !== 'boolean' || (onError !== undefined && typeof onError !== 'function'))
    throw new TypeError('Unsupported text drop options.');
  return { enabled, onError };
};

export const textDrop = (options: TextDropOptions = {}): EditorPlugin => {
  const initial = checkedOptions(options);
  return {
    name: 'text-drop',
    setup: (editor) => {
      const root = editor.surface;
      const owner = root.ownerDocument;
      const view = owner.defaultView!;
      let disposed = false;
      let enabled = initial.enabled;
      let composing = false;
      let revision = 0;
      let gesture = 0;
      let session: DragSession | undefined;
      let lastToken: string | undefined;
      let suppressDeletion = false;
      const cleanups: (() => void)[] = [];
      const assertActive = (): void => { if (disposed) throw new Error('Text drop plugin has been disposed.'); };
      const available = (): boolean => !disposed && enabled && !composing && editorOwned(editor) && !editor.isReadOnly();
      const invalidate = (): void => { session = undefined; gesture++; };
      const end = (): void => { invalidate(); lastToken = undefined; suppressDeletion = false; };
      const report = (error: unknown): void => {
        try { initial.onError?.(error); }
        catch { /* Diagnostic callbacks cannot own gesture cleanup. */ }
      };
      const claim = (event: Event): void => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      const currentSource = (source: DragSession): boolean => available() && session === source && source.revision === revision
        && flowAt(editor, source.range) === source.flow && source.range.toString() === source.rangeText;
      const dragstart = (event: DragEvent): void => {
        if (event.defaultPrevented || !event.cancelable || !available() || !event.dataTransfer) return;
        const transfer = event.dataTransfer;
        let started: DragSession | undefined;
        const cancelStart = (): void => {
          if (!started || lastToken === started.token) end();
          claim(event);
        };
        try {
          if (hasFiles(transfer)) return;
          const selection = owner.getSelection();
          if (!selection || selection.rangeCount !== 1) return;
          const range = selection.getRangeAt(0).cloneRange();
          const flow = !range.collapsed && flowAt(editor, range);
          if (!flow || !validDragTarget(editor, event.target, range, flow)) return;
          const payload = payloadFromRange(editor, range);
          const bytes = new Uint32Array(4);
          view.crypto.getRandomValues(bytes);
          const token = [...bytes].map((value) => value.toString(16).padStart(8, '0')).join('');
          const source: DragSession = {
            ...payload, token, range, flow, revision, rangeText: range.toString(),
            backward: selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset,
          };
          invalidate();
          session = source;
          started = source;
          lastToken = token;
          suppressDeletion = true;
          const valid = () => currentSource(source) && lastToken === token;
          transfer.setData('text/plain', payload.text);
          if (!valid()) { cancelStart(); return; }
          transfer.setData('text/html', payload.html);
          if (!valid()) { cancelStart(); return; }
          transfer.setData(privateDragType, token);
          if (!valid()) { cancelStart(); return; }
          transfer.effectAllowed = 'copyMove';
          if (!valid()) cancelStart();
        }
        catch (error) {
          cancelStart();
          report(error);
        }
      };
      const dragover = (event: DragEvent): void => {
        if (event.defaultPrevented || !event.cancelable || !available() || !event.dataTransfer) return;
        try {
          const transfer = event.dataTransfer;
          if (hasFiles(transfer) || !hasText(transfer) || !dropRange(editor, event)) return;
          event.preventDefault();
          transfer.dropEffect = session && currentSource(session) && !(event.ctrlKey || event.metaKey || event.altKey) ? 'move' : 'copy';
        }
        catch (error) { report(error); }
      };
      const drop = (event: DragEvent): void => {
        if (event.defaultPrevented || !event.cancelable || !available() || !event.dataTransfer) return;
        const stamp = revision;
        const activeGesture = gesture;
        const beforeSource = session;
        let claimed = false;
        try {
          const transfer = event.dataTransfer;
          if (hasFiles(transfer) || !hasText(transfer)) return;
          const target = dropRange(editor, event);
          if (!target) return;
          const targetFlow = flowAt(editor, target)!;
          const targetNode = target.startContainer;
          const targetOffset = target.startOffset;
          const baseline = editor.getHTML();
          const destinationFormats = editor.getFormats(target);
          claim(event);
          claimed = true;
          const token = transfer.getData(privateDragType);
          const own = Boolean(token && token === lastToken);
          const source = own ? beforeSource : undefined;
          if (own && (!source || source.token !== token || !currentSource(source))) return;
          const payload = readPayload(editor, transfer);
          const current = (): boolean => available() && revision === stamp && gesture === activeGesture
            && target.startContainer === targetNode && target.startOffset === targetOffset
            && flowAt(editor, target) === targetFlow && editor.getHTML() === baseline
            && (!own || Boolean(source && currentSource(source) && source.token === lastToken));
          if (!current()) return;
          if (source) {
            const actual = payloadFromRange(editor, source.range);
            if (actual.html !== source.html || actual.text !== source.text
              || payload.html !== source.html || payload.text !== source.text) return;
            if (containsPoint(source.range, target)) {
              transfer.dropEffect = 'none';
              invalidate();
              return;
            }
          }
          const move = Boolean(source) && !(event.ctrlKey || event.metaKey || event.altKey);
          transfer.dropEffect = move ? 'move' : 'copy';
          if (!current()) return;
          const originalSelection = owner.getSelection();
          const before = originalSelection?.rangeCount === 1 ? originalSelection.getRangeAt(0).cloneRange() : undefined;
          const backward = Boolean(before && originalSelection?.anchorNode === before.endContainer && originalSelection.anchorOffset === before.endOffset);
          editor.focus();
          if (!current() || !(owner.activeElement === root || root.contains(owner.activeElement))) return;
          // The outer transaction must capture the drag source, not its destination.
          if (source) selectRange(editor, source.range, source.backward);
          else if (before && flowAt(editor, before)) selectRange(editor, before, backward);
          editor.transact(() => {
            if (!current()) return;
            if (move && source) {
              const ancestors = new Set<Element>();
              for (const point of [source.range.startContainer, source.range.endContainer]) {
                for (let element = point.nodeType === 1 ? point as Element : point.parentElement; element && element !== source.flow; element = element.parentElement)
                  ancestors.add(element);
              }
              source.range.deleteContents();
              for (const ancestor of ancestors) {
                if (ancestor.isConnected && [...ancestor.childNodes].every((node) => node.nodeType === 3 && !node.textContent)) ancestor.remove();
              }
              normalizeFlow(source.flow);
            }
            if (!flowAt(editor, target)) throw new Error('Text drop lost its destination boundary.');
            const destinationAncestors = new Set<Element>();
            for (let element = target.startContainer.nodeType === 1 ? target.startContainer as Element : target.startContainer.parentElement; element && element !== root; element = element.parentElement)
              destinationAncestors.add(element);
            selectRange(editor, target);
            editor.insertHTML(payload.html);
            targetFlow.normalize();
            restoreDropCaret(editor, targetFlow, destinationAncestors, destinationFormats);
          });
          invalidate();
        }
        catch (error) {
          if (claimed) invalidate();
          report(error);
        }
      };
      const deleteByDrag = (event: InputEvent): void => {
        if (!disposed && suppressDeletion && event.inputType === 'deleteByDrag' && event.cancelable) claim(event);
      };
      const commands: TextDropCommands = {
        getState: () => { assertActive(); return { enabled }; },
        setEnabled: (value) => {
          assertActive();
          if (typeof value !== 'boolean') throw new TypeError('Text drop enabled must be boolean.');
          enabled = value;
          if (!value) invalidate();
        },
      };
      const listen = (type: string, listener: EventListener): void => {
        editor.element.addEventListener(type, listener, true);
        cleanups.push(() => editor.element.removeEventListener(type, listener, true));
      };
      const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        end();
        const failures: unknown[] = [];
        for (const cleanup of cleanups.splice(0).reverse()) {
          try { cleanup(); }
          catch (error) { failures.push(error); }
        }
        if (failures.length) throw new AggregateError(failures, 'Text drop cleanup failed.');
      };
      try {
        cleanups.push(editor.providePlugin('text-drop', commands));
        cleanups.push(editor.subscribe((change) => {
          revision++;
          invalidate();
          if (change.source === 'api') composing = false;
        }));
        cleanups.push(editor.events.on('readonlychange', (readOnly) => {
          if (readOnly) { composing = false; invalidate(); }
        }));
        listen('dragstart', dragstart as EventListener);
        listen('dragover', dragover as EventListener);
        listen('drop', drop as EventListener);
        listen('dragend', end);
        listen('beforeinput', deleteByDrag as EventListener);
        listen('compositionstart', () => { composing = true; invalidate(); });
        listen('compositionend', () => { composing = false; });
        return dispose;
      }
      catch (error) {
        try { dispose(); }
        catch { /* Preserve the installation failure. */ }
        throw error;
      }
    },
  };
};

export const textDropCommands = (editor: Editor): TextDropCommands => {
  const commands = editor.getPlugin<TextDropCommands>('text-drop');
  if (!commands) throw new Error('Install textDrop() on an active editor.');
  return commands;
};
