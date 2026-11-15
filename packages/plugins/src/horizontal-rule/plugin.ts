import { createEditorCommand } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { horizontalRuleTarget, insertHorizontalRule } from './selection.js';
import type { HorizontalRuleCommands } from './types.js';

const insertCommand = /* @__PURE__ */ createEditorCommand<void>('horizontal-rule.insert');

export const horizontalRule = (): EditorPlugin => ({
  name: 'horizontal-rule',
  setup: (editor) => {
    let disposed = false;
    let queryRange: Range | undefined;
    const assertActive = (): void => {
      if (disposed) throw new Error('Horizontal rule plugin has been disposed.');
    };
    const unregister = editor.commands.register(insertCommand, {
      validate: (payload) => {
        if (payload !== undefined) throw new TypeError('Expected no horizontal rule command payload.');
      },
      isEnabled: () => Boolean(horizontalRuleTarget(editor, queryRange)),
      execute: () => {
        const target = horizontalRuleTarget(editor);
        if (!target) throw new Error('Horizontal rule insertion lost its supported selection.');
        insertHorizontalRule(target);
      },
    });
    const commands: HorizontalRuleCommands = {
      insert: () => {
        assertActive();
        editor.commands.execute(insertCommand, undefined);
      },
      getState: (range) => {
        assertActive();
        const previousRange = queryRange;
        queryRange = range;
        try {
          return { disabled: !editor.commands.getState(insertCommand).enabled };
        }
        finally {
          queryRange = previousRange;
        }
      },
    };
    const unprovide = editor.providePlugin('horizontal-rule', commands);
    return () => {
      if (disposed) return;
      disposed = true;
      unprovide();
      unregister();
    };
  },
});

export const horizontalRuleCommands = (editor: Editor): HorizontalRuleCommands => {
  const commands = editor.getPlugin<HorizontalRuleCommands>('horizontal-rule');
  if (!commands) throw new Error('Horizontal rule plugin is not installed.');
  return commands;
};
