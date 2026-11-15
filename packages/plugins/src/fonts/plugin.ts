import { createEditorCommand } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { fontConfiguration } from './options.js';
import type { FontCommands, FontsOptions } from './types.js';

const familyCommand = /* @__PURE__ */ createEditorCommand<string | false>('fonts.setFamily');
const sizeCommand = /* @__PURE__ */ createEditorCommand<number | false>('fonts.setSize');

export const fonts = (options: FontsOptions = {}): EditorPlugin => {
  const configuration = fontConfiguration(options);
  const families = new Map(configuration.families.map((choice) => [choice.id, choice.family]));
  const sizes = new Set(configuration.sizes);
  return {
    name: 'fonts',
    setup: (editor) => {
      let disposed = false;
      const assertActive = (): void => {
        if (disposed) throw new Error('Fonts plugin has been disposed.');
      };
      const enabled = (): boolean => Boolean(editor.getSelection());
      const unregisterFamily = editor.commands.register(familyCommand, {
        validate: (value) => {
          if (value !== false && (typeof value !== 'string' || !families.has(value)))
            throw new TypeError('Choose a configured font family ID or false.');
          return value as string | false;
        },
        isEnabled: enabled,
        execute: (_editor, id) => editor.format('fontFamily', id === false ? false : families.get(id)!),
      });
      const unregisterSize = editor.commands.register(sizeCommand, {
        validate: (value) => {
          if (value !== false && (typeof value !== 'number' || !sizes.has(value)))
            throw new TypeError('Choose a configured font size or false.');
          return value as number | false;
        },
        isEnabled: enabled,
        execute: (_editor, size) => editor.format('fontSize', size === false ? false : `${size}px`),
      });
      const commands: FontCommands = {
        setFamily: (id) => {
          assertActive();
          editor.commands.execute(familyCommand, id);
        },
        setSize: (size) => {
          assertActive();
          editor.commands.execute(sizeCommand, size);
        },
        getState: () => {
          assertActive();
          const formats = editor.getFormats();
          const mixed = formats.mixed as string[] | undefined;
          return {
            disabled: !editor.commands.getState(familyCommand).enabled,
            family: typeof formats.fontFamily === 'string' ? formats.fontFamily : false,
            size: typeof formats.fontSize === 'string' ? formats.fontSize : false,
            familyMixed: Boolean(mixed?.includes('fontFamily')),
            sizeMixed: Boolean(mixed?.includes('fontSize')),
          };
        },
      };
      const unprovide = editor.providePlugin('fonts', commands);
      return () => {
        if (disposed) return;
        disposed = true;
        unprovide();
        unregisterFamily();
        unregisterSize();
      };
    },
  };
};

export const fontCommands = (editor: Editor): FontCommands => {
  const commands = editor.getPlugin<FontCommands>('fonts');
  if (!commands) throw new Error('Fonts plugin is not installed.');
  return commands;
};
