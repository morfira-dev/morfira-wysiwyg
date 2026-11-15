import { createEditorCommand } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { selectedPropertyList } from './selection.js';
import { markerFor, markerValue, reversedValue, startValue, explicitStart, explicitMarker } from './values.js';
import type { ListMarker, ListPropertyCommands } from './types.js';

const startCommand = /* @__PURE__ */ createEditorCommand<number | false>('list-properties.setStart');
const reversedCommand = /* @__PURE__ */ createEditorCommand<boolean>('list-properties.setReversed');
const markerCommand = /* @__PURE__ */ createEditorCommand<ListMarker | false>('list-properties.setMarker');

export const listProperties = (): EditorPlugin => ({
  name: 'list-properties',
  setup: (editor) => {
    let disposed = false;
    const assertActive = (): void => {
      if (disposed) throw new Error('List properties plugin has been disposed.');
    };
    const target = (): HTMLElement => {
      const list = selectedPropertyList(editor);
      if (!list) throw new Error('List properties lost their supported selection.');
      return list;
    };
    const ordered = (): boolean => selectedPropertyList(editor)?.localName === 'ol';
    const unregister = [
      editor.commands.register(startCommand, {
        validate: startValue,
        isEnabled: ordered,
        execute: (_editor, value) => {
          const list = target();
          if (list.localName !== 'ol') return;
          if (value === false) list.removeAttribute('start');
          else list.setAttribute('start', String(value));
        },
      }),
      editor.commands.register(reversedCommand, {
        validate: reversedValue,
        isEnabled: ordered,
        execute: (_editor, value) => {
          const list = target();
          if (list.localName !== 'ol') return;
          if (value) list.setAttribute('reversed', '');
          else list.removeAttribute('reversed');
        },
      }),
      editor.commands.register(markerCommand, {
        validate: markerValue,
        isEnabled: () => Boolean(selectedPropertyList(editor)),
        execute: (_editor, value) => {
          const list = target();
          if (value !== false && !markerFor(list, value)) return;
          if (value === false) list.style.removeProperty('list-style-type');
          else list.style.setProperty('list-style-type', value);
          if (!list.style.length) list.removeAttribute('style');
        },
      }),
    ];
    const commands: ListPropertyCommands = {
      setStart: (input) => {
        assertActive();
        const value = startValue(input);
        const list = selectedPropertyList(editor);
        if (!list || list.localName !== 'ol' || explicitStart(list) === value) return;
        editor.commands.execute(startCommand, value);
      },
      setReversed: (input) => {
        assertActive();
        const value = reversedValue(input);
        const list = selectedPropertyList(editor);
        if (!list || list.localName !== 'ol' || list.hasAttribute('reversed') === value) return;
        editor.commands.execute(reversedCommand, value);
      },
      setMarker: (input) => {
        assertActive();
        const value = markerValue(input);
        const list = selectedPropertyList(editor);
        if (!list || (value !== false && !markerFor(list, value)) || explicitMarker(list) === value) return;
        editor.commands.execute(markerCommand, value);
      },
      getState: () => {
        assertActive();
        const list = selectedPropertyList(editor);
        return {
          disabled: !editor.commands.getState(markerCommand).enabled,
          kind: list ? list.localName === 'ol' ? 'ordered' : 'bullet' : false,
          start: list ? explicitStart(list) : false,
          reversed: list?.localName === 'ol' && list.hasAttribute('reversed'),
          marker: list ? explicitMarker(list) : false,
        };
      },
    };
    const unprovide = editor.providePlugin('list-properties', commands);
    return () => {
      if (disposed) return;
      disposed = true;
      unprovide();
      for (const remove of unregister) remove();
    };
  },
});

export const listPropertyCommands = (editor: Editor): ListPropertyCommands => {
  const commands = editor.getPlugin<ListPropertyCommands>('list-properties');
  if (!commands) throw new Error('List properties plugin is not installed.');
  return commands;
};
