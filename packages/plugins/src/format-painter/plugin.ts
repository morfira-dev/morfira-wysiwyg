import { createEditorCommand } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { ordinaryLayoutBlock } from '../text-layout/selection.js';
import type { FormatPainterCommands, FormatSnapshot } from './types.js';

const marks = ['bold', 'italic', 'underline', 'strike', 'code', 'subscript', 'superscript'] as const;
const styles = ['color', 'background', 'fontFamily', 'fontSize'] as const;
const keys = [...marks, ...styles];
const applyCommand = /* @__PURE__ */ createEditorCommand<undefined>('format-painter.apply');
const ordinaryRange = (editor: Editor): Range | undefined => {
  const selection = editor.surface.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  const first = ordinaryLayoutBlock(editor, range.startContainer);
  return first && first === ordinaryLayoutBlock(editor, range.endContainer) ? range : undefined;
};

export const formatPainter = (): EditorPlugin => ({
  name: 'format-painter',
  setup: (editor) => {
    let disposed = false;
    let composing = false;
    let snapshot: FormatSnapshot | undefined;
    const assertActive = (): void => {
      if (disposed) throw new Error('Format painter has been disposed.');
    };
    const captureValue = (): FormatSnapshot | undefined => {
      const range = ordinaryRange(editor);
      if (!range || composing) return;
      const formats = editor.getFormats(range);
      const mixed = Array.isArray(formats.mixed) ? formats.mixed : [];
      if (keys.some((key) => mixed.includes(key))) return;
      const result: Record<string, string | boolean> = {};
      for (const key of marks) result[key] = formats[key] === true;
      for (const key of styles) result[key] = typeof formats[key] === 'string' ? formats[key] as string : false;
      return Object.freeze(result);
    };
    const enabled = (): boolean => Boolean(snapshot && ordinaryRange(editor)?.collapsed === false);
    const unregister = editor.commands.register(applyCommand, {
      validate: (value) => {
        if (value !== undefined) throw new TypeError('Format painter apply accepts no payload.');
        return undefined;
      },
      isEnabled: enabled,
      execute: () => {
        if (!snapshot || !ordinaryRange(editor) || ordinaryRange(editor)!.collapsed) throw new Error('Format painter lost its supported target.');
        const value = snapshot;
        for (const key of keys) editor.format(key, value[key]);
      },
    });
    const commands: FormatPainterCommands = {
      capture: () => {
        assertActive();
        const value = captureValue();
        if (!value) return false;
        snapshot = value;
        return true;
      },
      apply: () => {
        assertActive();
        if (!editor.commands.getState(applyCommand).enabled) return false;
        const range = ordinaryRange(editor)?.cloneRange();
        const handle = editor.selection.capture();
        if (!range || !handle) return false;
        try {
          editor.focus();
          const current = ordinaryRange(editor);
          if (!editor.selection.isCurrent(handle) || !current || current.startContainer !== range.startContainer
            || current.startOffset !== range.startOffset || current.endContainer !== range.endContainer || current.endOffset !== range.endOffset) return false;
          return editor.commands.execute(applyCommand, undefined);
        }
        finally { editor.selection.release(handle); }
      },
      clear: () => {
        assertActive();
        snapshot = undefined;
      },
      getState: () => {
        assertActive();
        return { captured: Boolean(snapshot), canCapture: Boolean(captureValue()), canApply: editor.commands.getState(applyCommand).enabled };
      },
    };
    const startComposition = (): void => { composing = true; };
    const endComposition = (): void => { composing = false; };
    editor.surface.addEventListener('compositionstart', startComposition);
    editor.surface.addEventListener('compositionend', endComposition);
    const unprovide = editor.providePlugin('format-painter', commands);
    const stopReadOnly = editor.events.on('readonlychange', () => { composing = false; });
    const stopChange = editor.subscribe((change) => {
      if (change.source === 'api') {
        snapshot = undefined;
        composing = false;
      }
    });
    return () => {
      if (disposed) return;
      disposed = true;
      snapshot = undefined;
      editor.surface.removeEventListener('compositionstart', startComposition);
      editor.surface.removeEventListener('compositionend', endComposition);
      stopReadOnly();
      stopChange();
      unprovide();
      unregister();
    };
  },
});

export const formatPainterCommands = (editor: Editor): FormatPainterCommands => {
  const commands = editor.getPlugin<FormatPainterCommands>('format-painter');
  if (!commands) throw new Error('Format painter plugin is not installed.');
  return commands;
};
