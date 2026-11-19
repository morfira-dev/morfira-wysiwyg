import { createEditorCommand } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { checklistAttribute, checklistSchema } from './schema.js';
import type { ChecklistCommands, ChecklistOptions } from './types.js';
import { setupChecklistInteraction } from './interaction.js';

const namespace = 'http://www.w3.org/1999/xhtml';
const insertCommand = /* @__PURE__ */ createEditorCommand<void>('checklists.insert');
const checkedCommand = /* @__PURE__ */ createEditorCommand<boolean>('checklists.setChecked');
const toggleCommand = /* @__PURE__ */ createEditorCommand<void>('checklists.toggle');
const removeCommand = /* @__PURE__ */ createEditorCommand<void>('checklists.remove');

/** Both endpoints must resolve to one owner; commands never mark its descendant items. */
const selectedBlock = (editor: Editor): HTMLElement | undefined => {
  const root = editor.surface;
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  const blockAt = (node: Node): HTMLElement | undefined => {
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!element || !root.contains(element)) return;
    for (let ancestor: Element | null = element; ancestor && ancestor !== root; ancestor = ancestor.parentElement)
      if (ancestor.namespaceURI !== namespace) return;
    const semantic = element.closest('[data-mw-node]');
    if (semantic && root.contains(semantic)) return;
    const item = element.closest<HTMLElement>('li');
    if (item && root.contains(item)) {
      const list = item.parentElement;
      if (item.namespaceURI !== namespace || item.hasAttribute('data-mw-node') || !list || list.namespaceURI !== namespace
        || !['ul', 'ol'].includes(list.localName) || list.hasAttribute('data-mw-node')) return;
      const value = item.getAttribute(checklistAttribute);
      return value === null || value === 'false' || value === 'true' ? item : undefined;
    }
    const block = element.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
    return block?.parentElement === root && block.namespaceURI === namespace && !block.hasAttribute('data-mw-node') ? block : undefined;
  };
  const start = blockAt(range.startContainer);
  return start && start === blockAt(range.endContainer) ? start : undefined;
};
const selectedTask = (editor: Editor): HTMLElement | undefined => {
  const block = selectedBlock(editor);
  return block?.localName === 'li' && block.hasAttribute(checklistAttribute) ? block : undefined;
};
const noPayload = (value: unknown): void => {
  if (value !== undefined) throw new TypeError('Expected no checklist command payload.');
};

export const checklists = (options: ChecklistOptions = {}): EditorPlugin => {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => key !== 'interactive'))
    throw new TypeError('Expected checklist interaction options.');
  const { interactive = true } = options;
  if (typeof interactive !== 'boolean') throw new TypeError('Checklist interactive must be boolean.');
  return {
    name: 'checklists',
    schema: [checklistSchema],
    setup: (editor) => {
      let disposed = false;
      const active = (): void => {
        if (disposed) throw new Error('Checklists plugin has been disposed.');
      };
      const unregister = [
        editor.commands.register(insertCommand, {
          validate: noPayload,
          isEnabled: () => Boolean(selectedBlock(editor)),
          execute: () => {
            let block = selectedBlock(editor)!;
            if (block.localName !== 'li') {
              editor.format('list', 'bullet');
              block = selectedBlock(editor)!;
              if (block?.localName !== 'li') throw new Error('Checklist conversion did not retain its list-item selection.');
            }
            if (!block.hasAttribute(checklistAttribute)) block.setAttribute(checklistAttribute, 'false');
          },
        }),
        editor.commands.register(checkedCommand, {
          validate: (value) => {
            if (typeof value !== 'boolean') throw new TypeError('Expected a boolean checklist state.');
            return value;
          },
          isEnabled: () => Boolean(selectedTask(editor)),
          execute: (_editor, checked) => selectedTask(editor)!.setAttribute(checklistAttribute, String(checked)),
        }),
        editor.commands.register(toggleCommand, {
          validate: noPayload,
          isEnabled: () => Boolean(selectedTask(editor)),
          execute: () => {
            const item = selectedTask(editor)!;
            item.setAttribute(checklistAttribute, String(item.getAttribute(checklistAttribute) !== 'true'));
          },
        }),
        editor.commands.register(removeCommand, {
          validate: noPayload,
          isEnabled: () => Boolean(selectedTask(editor)),
          execute: () => selectedTask(editor)!.removeAttribute(checklistAttribute),
        }),
      ];
      const commands: ChecklistCommands = {
        insert: () => { active(); editor.commands.execute(insertCommand, undefined); },
        setChecked: (checked) => { active(); editor.commands.execute(checkedCommand, checked); },
        toggle: () => { active(); editor.commands.execute(toggleCommand, undefined); },
        remove: () => { active(); editor.commands.execute(removeCommand, undefined); },
        getState: () => {
          active();
          const item = selectedTask(editor);
          return {
            disabled: !editor.commands.getState(insertCommand).enabled,
            active: Boolean(item),
            checked: item ? item.getAttribute(checklistAttribute) === 'true' : undefined,
          };
        },
      };
      const unprovide = editor.providePlugin('checklists', commands);
      let stopInteraction: (() => void) | undefined;
      try {
        if (interactive) stopInteraction = setupChecklistInteraction(editor, () => selectedTask(editor));
      }
      catch (error) {
        unprovide();
        for (const remove of unregister) remove();
        throw error;
      }
      return () => {
        if (disposed) return;
        disposed = true;
        const errors: unknown[] = [];
        for (const cleanup of [stopInteraction, unprovide, ...unregister]) {
          try { cleanup?.(); }
          catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'Checklist cleanup failed.');
      };
    },
  };
};

export const checklistCommands = (editor: Editor): ChecklistCommands => {
  const commands = editor.getPlugin<ChecklistCommands>('checklists');
  if (!commands) throw new Error('Checklists plugin is not installed.');
  return commands;
};
