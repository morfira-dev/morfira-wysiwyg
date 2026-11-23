import { createEditorCommand } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin, EditorSelectionHandle } from '@morfira-dev/wysiwyg-core';
import { layoutTargets } from './selection.js';
import type { TextLayoutCommands, TextLayoutPatch, TextLayoutProperty } from './types.js';

const command = /* @__PURE__ */ createEditorCommand<TextLayoutPatch>('text-layout.set');
const numeric = (property: TextLayoutProperty, value: unknown): number | false => {
  if (value === false) return false;
  const valid = typeof value === 'number' && Number.isFinite(value) && (property === 'lineHeight'
    ? value >= 0.5 && value <= 4 && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-8
    : Number.isInteger(value) && value >= 0 && value <= 96);
  if (!valid) throw new TypeError(property === 'lineHeight' ? 'Line height must be 0.5–4 with at most three decimals, or false.' : 'Paragraph spacing must be an integer 0–96px, or false.');
  return value as number;
};
const explicit = (block: HTMLElement, property: TextLayoutProperty): number | false => {
  const value = block.style[property];
  if (!value) return false;
  const number = Number(property === 'lineHeight' ? value : value.replace(/px$/, ''));
  try { return numeric(property, number); }
  catch { return false; }
};

export const textLayout = (): EditorPlugin => ({
  name: 'text-layout',
  setup: (editor) => {
    let disposed = false;
    const assertActive = (): void => {
      if (disposed) throw new Error('Text layout plugin has been disposed.');
    };
    const unregister = editor.commands.register(command, {
      validate: (patch) => {
        if (!patch || typeof patch !== 'object') throw new TypeError('Expected a text-layout patch.');
        const input = patch as Record<string, unknown>;
        if (!['lineHeight', 'marginTop', 'marginBottom'].includes(input.property as string)) throw new TypeError('Expected a text-layout property.');
        const property = input.property as TextLayoutProperty;
        const handle = input.handle as EditorSelectionHandle;
        const range = editor.selection.getRange(handle);
        if (!range) throw new Error('Text layout target became stale.');
        return { property, value: numeric(property, input.value), handle, range };
      },
      isEnabled: () => Boolean(layoutTargets(editor)),
      execute: (_editor, patch) => {
        const targets = layoutTargets(editor);
        const current = editor.surface.ownerDocument.getSelection();
        const range = current?.rangeCount === 1 ? current.getRangeAt(0) : undefined;
        if (!targets || !patch.range || !editor.selection.isCurrent(patch.handle) || !range
          || range.startContainer !== patch.range.startContainer || range.startOffset !== patch.range.startOffset
          || range.endContainer !== patch.range.endContainer || range.endOffset !== patch.range.endOffset) throw new Error('Text layout lost its supported selection.');
        for (const block of targets) block.style[patch.property] = patch.value === false ? '' : `${patch.value}${patch.property === 'lineHeight' ? '' : 'px'}`;
      },
    });
    const set = (property: TextLayoutProperty, input: number | false): void => {
      assertActive();
      const value = numeric(property, input);
      const targets = layoutTargets(editor);
      if (!targets || targets.every((block) => explicit(block, property) === value)) return;
      if (!editor.commands.getState(command).enabled) return;
      const handle = editor.selection.capture();
      if (!handle) return;
      try {
        const saved = editor.selection.getRange(handle);
        editor.focus();
        const selection = editor.surface.ownerDocument.getSelection();
        const current = selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
        if (!saved || !current || !editor.selection.isCurrent(handle)
          || current.startContainer !== saved.startContainer || current.startOffset !== saved.startOffset
          || current.endContainer !== saved.endContainer || current.endOffset !== saved.endOffset) return;
        editor.commands.execute(command, { property, value, handle });
      }
      finally { editor.selection.release(handle); }
    };
    const commands: TextLayoutCommands = {
      setLineHeight: (value) => set('lineHeight', value),
      setSpaceBefore: (value) => set('marginTop', value),
      setSpaceAfter: (value) => set('marginBottom', value),
      getState: () => {
        assertActive();
        const targets = layoutTargets(editor);
        const state = (property: TextLayoutProperty): { value: number | false; mixed: boolean } => {
          const first = targets ? explicit(targets[0], property) : false;
          const mixed = Boolean(targets?.some((block) => explicit(block, property) !== first));
          return { value: mixed ? false : first, mixed };
        };
        const lineHeight = state('lineHeight');
        const before = state('marginTop');
        const after = state('marginBottom');
        return { disabled: !editor.commands.getState(command).enabled, lineHeight: lineHeight.value, spaceBefore: before.value, spaceAfter: after.value,
          lineHeightMixed: lineHeight.mixed, spaceBeforeMixed: before.mixed, spaceAfterMixed: after.mixed };
      },
    };
    const unprovide = editor.providePlugin('text-layout', commands);
    return () => {
      if (disposed) return;
      disposed = true;
      unprovide();
      unregister();
    };
  },
});

export const textLayoutCommands = (editor: Editor): TextLayoutCommands => {
  const commands = editor.getPlugin<TextLayoutCommands>('text-layout');
  if (!commands) throw new Error('Text layout plugin is not installed.');
  return commands;
};
