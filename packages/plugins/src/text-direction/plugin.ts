import { createEditorCommand } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { directionTargets } from './selection.js';
import type { TextDirection, TextDirectionCommands } from './types.js';

const directionCommand = /* @__PURE__ */ createEditorCommand<TextDirection | false>('text-direction.setDirection');
const directionValue = (value: unknown): TextDirection | false => {
  if (value !== false && value !== 'ltr' && value !== 'rtl') throw new TypeError('Direction must be ltr, rtl or false.');
  return value;
};
const explicitDirection = (target: HTMLElement): TextDirection | false => {
  const value = target.getAttribute('dir');
  return value === 'ltr' || value === 'rtl' ? value : false;
};

export const textDirection = (): EditorPlugin => ({
  name: 'text-direction',
  setup: (editor) => {
    let disposed = false;
    const assertActive = (): void => {
      if (disposed) throw new Error('Text direction plugin has been disposed.');
    };
    const unregister = editor.commands.register(directionCommand, {
      validate: directionValue,
      isEnabled: () => Boolean(directionTargets(editor)),
      execute: (_editor, value) => {
        const targets = directionTargets(editor);
        if (!targets) throw new Error('Text direction lost its supported selection.');
        for (const target of targets) {
          if (value === false) target.removeAttribute('dir');
          else target.setAttribute('dir', value);
        }
      },
    });
    const commands: TextDirectionCommands = {
      setDirection: (input) => {
        assertActive();
        const value = directionValue(input);
        const targets = directionTargets(editor);
        if (!targets || targets.every((target) => value === false ? !target.hasAttribute('dir') : target.getAttribute('dir') === value)) return;
        editor.commands.execute(directionCommand, value);
      },
      getState: () => {
        assertActive();
        const targets = directionTargets(editor);
        const direction = targets ? explicitDirection(targets[0]) : false;
        const mixed = Boolean(targets?.some((target) => explicitDirection(target) !== direction));
        return { disabled: !editor.commands.getState(directionCommand).enabled, direction: mixed ? false : direction, mixed };
      },
    };
    const unprovide = editor.providePlugin('text-direction', commands);
    return () => {
      if (disposed) return;
      disposed = true;
      unprovide();
      unregister();
    };
  },
});

export const textDirectionCommands = (editor: Editor): TextDirectionCommands => {
  const commands = editor.getPlugin<TextDirectionCommands>('text-direction');
  if (!commands) throw new Error('Text direction plugin is not installed.');
  return commands;
};
