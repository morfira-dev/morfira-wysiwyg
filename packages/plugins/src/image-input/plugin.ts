import type { EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { imageCommands } from '../images/index.js';
import { currentInputRange, dropInputRange, validInputRange } from './target.js';
import { hasInputFiles, inputFile } from './transfer.js';
import type { ImageInputOptions } from './types.js';

export const imageInput = (options: ImageInputOptions = {}): EditorPlugin => {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Reflect.ownKeys(options).some((key) => key !== 'onError') ||
      (options.onError !== undefined && typeof options.onError !== 'function'))
    throw new TypeError('Image input options accept only an optional onError callback.');
  const onError = options.onError;
  return {
    name: 'image-input',
    setup: (editor) => {
      const images = imageCommands(editor);
      let disposed = false;
      let composing = false;
      let pending: AbortController | undefined;
      let revision = 0;
      const ownsTarget = (event: Event) => event.target instanceof Node && editor.surface.contains(event.target);
      const report = (error: unknown) => {
        if (disposed) return;
        try { void Promise.resolve(onError?.(error)).catch(() => {}); }
        catch { /* Error presentation must not reject an event listener. */ }
      };
      const receive = (event: ClipboardEvent | DragEvent, transfer: DataTransfer | null, resolveRange: () => Range | undefined) => {
        if (disposed || !ownsTarget(event) || !transfer || !hasInputFiles(transfer)) return;
        const cancelled = event.defaultPrevented;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (cancelled) return;
        try {
          if (editor.isReadOnly() || composing) throw new Error('Image input is unavailable during read-only or composition.');
          const file = inputFile(transfer);
          const range = resolveRange();
          if (!range) throw new RangeError('Choose an ordinary text block in this editor for the image.');
          const before = revision;
          const html = editor.getHTML();
          const start = range.startContainer;
          const startOffset = range.startOffset;
          const end = range.endContainer;
          const endOffset = range.endOffset;
          editor.focus();
          if (disposed || editor.isReadOnly() || composing || revision !== before || editor.getHTML() !== html ||
              editor.surface.ownerDocument.activeElement !== editor.surface || !validInputRange(editor, range) ||
              range.startContainer !== start || range.startOffset !== startOffset ||
              range.endContainer !== end || range.endOffset !== endOffset)
            throw new RangeError('The image insertion target changed while focusing the editor.');
          pending?.abort();
          const controller = new AbortController();
          pending = controller;
          const selection = editor.surface.ownerDocument.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          void images.upload(file, { signal: controller.signal }).catch(report).finally(() => {
            if (pending === controller) pending = undefined;
          });
        }
        catch (error) { report(error); }
      };
      const paste = (event: ClipboardEvent) => receive(event, event.clipboardData, () => currentInputRange(editor));
      const drop = (event: DragEvent) => receive(event, event.dataTransfer, () => dropInputRange(editor, event));
      const dragover = (event: DragEvent) => {
        if (disposed || !ownsTarget(event) || !event.dataTransfer || !hasInputFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = composing || editor.isReadOnly() ? 'none' : 'copy';
      };
      const compositionStart = () => {
        if (editor.isReadOnly()) return;
        composing = true;
        revision++;
      };
      const compositionEnd = () => { composing = false; };
      const unsubscribe = editor.subscribe((change) => {
        revision++;
        if (change.source === 'api') composing = false;
      });
      const unreadonly = editor.events.on('readonlychange', (readOnly) => {
        revision++;
        if (readOnly) composing = false;
      });
      editor.element.addEventListener('paste', paste, true);
      editor.element.addEventListener('drop', drop, true);
      editor.element.addEventListener('dragover', dragover, true);
      editor.surface.addEventListener('compositionstart', compositionStart);
      editor.surface.addEventListener('compositionend', compositionEnd);
      return () => {
        disposed = true;
        pending?.abort();
        pending = undefined;
        unsubscribe();
        unreadonly();
        editor.element.removeEventListener('paste', paste, true);
        editor.element.removeEventListener('drop', drop, true);
        editor.element.removeEventListener('dragover', dragover, true);
        editor.surface.removeEventListener('compositionstart', compositionStart);
        editor.surface.removeEventListener('compositionend', compositionEnd);
      };
    },
  };
};
