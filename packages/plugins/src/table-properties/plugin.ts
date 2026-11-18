import { createEditorCommand } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { tableCommands } from '../tables/plugin.js';
import type { TableSelectionState } from '../tables/types.js';
import { sameTablePropertyTarget, tablePropertyTarget } from './target.js';
import { cellVerticalAlign, checkedTablePropertiesPatch, mixedCellValue, patchMargins, styleChanges, tableAlignment, tableWidth, writeStyle } from './values.js';
import { applyTableSemantics, planTableSemantics, tableCaption, tableHeaders } from './semantics.js';
import type { TablePropertiesRequest, TableSemanticsPlan } from './internal-types.js';
import type { TablePropertiesCommands, TablePropertiesPatch } from './types.js';

const updateCommand = /* @__PURE__ */ createEditorCommand<TablePropertiesRequest>('table-properties.update');
const changes = (target: TableSelectionState, patch: TablePropertiesPatch, semantics: TableSemanticsPlan): boolean => {
  if (semantics.cells.length || semantics.captionChanged) return true;
  if (patch.width !== undefined && (target.table.hasAttribute('width') || styleChanges(target.table, 'width', patch.width))) return true;
  if (patch.alignment !== undefined) {
    const [left, right] = patchMargins(patch.alignment);
    if (styleChanges(target.table, 'margin-left', left) || styleChanges(target.table, 'margin-right', right)) return true;
  }
  return target.cells.some((cell) => (patch.cellBackground !== undefined && styleChanges(cell, 'background-color', patch.cellBackground))
    || (patch.cellBorder !== undefined && styleChanges(cell, 'border-color', patch.cellBorder))
    || (patch.cellVerticalAlign !== undefined && styleChanges(cell, 'vertical-align', patch.cellVerticalAlign)));
};
const apply = (editor: Editor, target: TableSelectionState, patch: TablePropertiesPatch, semantics: TableSemanticsPlan): void => {
  if (patch.width !== undefined) {
    target.table.removeAttribute('width');
    writeStyle(target.table, 'width', patch.width);
  }
  if (patch.alignment !== undefined) {
    const [left, right] = patchMargins(patch.alignment);
    writeStyle(target.table, 'margin-left', left);
    writeStyle(target.table, 'margin-right', right);
  }
  for (const cell of target.cells) {
    if (patch.cellBackground !== undefined) writeStyle(cell, 'background-color', patch.cellBackground);
    if (patch.cellBorder !== undefined) writeStyle(cell, 'border-color', patch.cellBorder);
    if (patch.cellVerticalAlign !== undefined) writeStyle(cell, 'vertical-align', patch.cellVerticalAlign);
  }
  applyTableSemantics(editor, target, semantics);
};

export const tableProperties = (): EditorPlugin => ({
  name: 'table-properties',
  setup: (editor) => {
    tableCommands(editor);
    let disposed = false;
    const assertActive = () => {
      if (disposed) throw new Error('Table properties plugin has been disposed.');
    };
    const unregister = editor.commands.register(updateCommand, {
      validate: (input) => {
        if (!input || typeof input !== 'object' || !('expected' in input) || !('patch' in input))
          throw new TypeError('Expected an internal table properties request.');
        const request = input as TablePropertiesRequest;
        return { expected: request.expected, patch: checkedTablePropertiesPatch(request.patch, editor.surface.ownerDocument) };
      },
      isEnabled: () => Boolean(tablePropertyTarget(editor)),
      execute: (_editor, request) => {
        if (disposed || !editor.commands.getState(updateCommand).enabled) return;
        const target = tablePropertyTarget(editor);
        if (!target || !sameTablePropertyTarget(request.expected, target)) return;
        const semantics = planTableSemantics(target.table, request.patch);
        if (changes(target, request.patch, semantics)) apply(editor, target, request.patch, semantics);
      },
    });
    const commands: TablePropertiesCommands = {
      update: (input) => {
        assertActive();
        const patch = checkedTablePropertiesPatch(input, editor.surface.ownerDocument);
        assertActive();
        const target = tablePropertyTarget(editor);
        if (!target || !changes(target, patch, planTableSemantics(target.table, patch))) return;
        editor.commands.execute(updateCommand, { expected: target, patch });
      },
      getState: () => {
        assertActive();
        const target = tablePropertyTarget(editor);
        return {
          disabled: !target || !editor.commands.getState(updateCommand).enabled,
          ...(target ? tableHeaders(target.table) : { headerRow: false, headerColumn: false }),
          caption: target ? tableCaption(target.table) : false,
          width: target ? tableWidth(target.table) : false,
          alignment: target ? tableAlignment(target.table) : false,
          cellBackground: target ? mixedCellValue(target.cells, (cell) => cell.style.backgroundColor || false) : false,
          cellBorder: target ? mixedCellValue(target.cells, (cell) => cell.style.borderColor || false) : false,
          cellVerticalAlign: target ? mixedCellValue(target.cells, cellVerticalAlign) : false,
        };
      },
    };
    const unprovide = editor.providePlugin('table-properties', commands);
    return () => {
      if (disposed) return;
      disposed = true;
      unprovide();
      unregister();
    };
  },
});

export const tablePropertyCommands = (editor: Editor): TablePropertiesCommands => {
  const commands = editor.getPlugin<TablePropertiesCommands>('table-properties');
  if (!commands) throw new Error('Install tableProperties() on an active editor.');
  return commands;
};
