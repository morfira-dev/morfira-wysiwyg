import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import type { AutolinkCommands, AutolinkOptions } from './types.js';
import { blockSelector, candidateAt, excluded, prefixAt } from './flow.js';
import { installCompletion } from './completion.js';

const checkedOptions = (options: AutolinkOptions): boolean => {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some((key) => key !== 'enabled'))
    throw new TypeError('Expected autolink options.');
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean') throw new TypeError('Autolink enabled must be boolean.');
  return options.enabled ?? true;
};

export const autolink = (options: AutolinkOptions = {}): EditorPlugin => {
  const initiallyEnabled = checkedOptions(options);
  return {
    name: 'autolink',
    setup: (editor) => {
      const root = editor.surface;
      let enabled = initiallyEnabled;
      let composing = false;
      let disposed = false;
      const assertActive = () => {
        if (disposed) throw new Error('Autolink has been disposed.');
      };
      const commands: AutolinkCommands = {
        getState: () => { assertActive(); return { enabled }; },
        setEnabled: (value) => {
          assertActive();
          if (typeof value !== 'boolean') throw new TypeError('Autolink enabled must be boolean.');
          enabled = value;
        },
      };
      const input = (event: Event) => {
        const native = event as InputEvent;
        if (disposed || !enabled || composing || native.isComposing || native.inputType !== 'insertText' || native.data !== ' ' || editor.isReadOnly()) return;
        const selection = root.ownerDocument.getSelection();
        if (!selection?.rangeCount) return;
        const caret = selection.getRangeAt(0);
        if (!caret.collapsed || !root.contains(caret.startContainer)) return;
        const element = caret.startContainer.nodeType === 1 ? caret.startContainer as Element : caret.startContainer.parentElement;
        if (!element || element.closest(excluded)) return;
        const block = element.closest<HTMLElement>(blockSelector);
        if (!block || !root.contains(block)) return;
        const flow = prefixAt(block, caret);
        const candidate = candidateAt(flow.text, flow.truncated, true);
        const saved = editor.getSelection();
        if (!candidate || !saved || saved.length) return;
        const offset = saved.index - flow.text.length + candidate.start;
        editor.transact(() => {
          editor.setSelection(offset, candidate.length);
          editor.format('link', { href: candidate.href });
          editor.setSelection(saved.index);
        });
      };
      const startComposition = () => { composing = true; };
      const endComposition = () => { composing = false; };
      const unchange = editor.subscribe((change) => { if (change.source === 'api') composing = false; });
      const unreadonly = editor.events.on('readonlychange', (value) => { if (value) composing = false; });
      const unprovide = editor.providePlugin('autolink', commands);
      const removeCompletion = installCompletion(editor, () => enabled && !composing && !disposed);
      root.addEventListener('input', input);
      root.addEventListener('compositionstart', startComposition);
      root.addEventListener('compositionend', endComposition);
      return () => {
        if (disposed) return;
        disposed = true;
        removeCompletion();
        unchange();
        unreadonly();
        root.removeEventListener('input', input);
        root.removeEventListener('compositionstart', startComposition);
        root.removeEventListener('compositionend', endComposition);
        unprovide();
      };
    },
  };
};

export const autolinkCommands = (editor: Editor): AutolinkCommands => {
  const commands = editor.getPlugin<AutolinkCommands>('autolink');
  if (!commands) throw new Error('Install the autolink plugin first.');
  return commands;
};
