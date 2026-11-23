import { createEditorCommand } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg-core';
import { tableCommands } from '../tables/plugin.js';
import type { TableSelectionState } from '../tables/types.js';
import { sameTablePropertyTarget, tablePropertyTarget } from './target.js';
import { cellBorderStyle, cellVerticalAlign, cellTextAlign, cellDirection, checkedTablePropertiesPatch, mixedCellValue, patchMargins, styleChanges, tableAlignment, tableWidth, writeStyle } from './values.js';
import { applyTableSemantics, planTableSemantics, tableCaption, tableHeaders } from './semantics.js';
import { rowMinHeightState, selectedPropertyRows } from './rows.js';
import type { TablePropertiesRequest, TableSemanticsPlan, TableCellStylePair } from './internal-types.js';
import type { TablePropertiesCommands, TablePropertiesPatch } from './types.js';

const updateCommand = /* @__PURE__ */ createEditorCommand<TablePropertiesRequest>('table-properties.update');
const cellStyles: readonly TableCellStylePair[] = [
  ['cellPadding', 'padding'], ['cellBorderWidth', 'border-width'], ['cellBorderStyle', 'border-style'],
  ['cellBackground', 'background-color'], ['cellBorder', 'border-color'], ['cellVerticalAlign', 'vertical-align'],
];
const changes = (target: TableSelectionState, patch: TablePropertiesPatch, semantics: TableSemanticsPlan): boolean => {
  if (semantics.cells.length || semantics.captionChanged) return true;
  if (patch.rowMinHeight !== undefined && selectedPropertyRows(target).some((row) => styleChanges(row, 'height', patch.rowMinHeight!))) return true;
  if (patch.width !== undefined && (target.table.hasAttribute('width') || styleChanges(target.table, 'width', patch.width))) return true;
  if (patch.alignment !== undefined) {
    const [left, right] = patchMargins(patch.alignment);
    if (styleChanges(target.table, 'margin-left', left) || styleChanges(target.table, 'margin-right', right)) return true;
  }
  return target.cells.some((cell) => (patch.cellBackground !== undefined && styleChanges(cell, 'background-color', patch.cellBackground))
    || (patch.cellTextAlign !== undefined && styleChanges(cell, 'text-align', patch.cellTextAlign))
    || (patch.cellDirection !== undefined && (patch.cellDirection === false ? cell.hasAttribute('dir') : cell.getAttribute('dir') !== patch.cellDirection))
    || cellStyles.some(([field, property]) => field !== 'cellBackground' && patch[field] !== undefined && styleChanges(cell, property, patch[field]!)));
};
const apply = (editor: Editor, target: TableSelectionState, patch: TablePropertiesPatch, semantics: TableSemanticsPlan): void => {
  if (patch.rowMinHeight !== undefined)
    for (const row of selectedPropertyRows(target)) writeStyle(row, 'height', patch.rowMinHeight);
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
    if (patch.cellTextAlign !== undefined) writeStyle(cell, 'text-align', patch.cellTextAlign);
    if (patch.cellDirection === false) cell.removeAttribute('dir');
    else if (patch.cellDirection !== undefined) cell.setAttribute('dir', patch.cellDirection);
    for (const [field, property] of cellStyles) {
      const value = patch[field];
      if (value !== undefined) writeStyle(cell, property, value);
    }
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
        const fromCells = <Value extends string | false>(read: (cell: HTMLTableCellElement) => Value) =>
          target ? mixedCellValue(target.cells, read) : false;
        return {
          disabled: !target || !editor.commands.getState(updateCommand).enabled,
          cellTextAlign: fromCells(cellTextAlign),
          cellDirection: fromCells(cellDirection),
          cellPadding: fromCells((cell) => cell.style.padding || false),
          cellBorderWidth: fromCells((cell) => cell.style.borderWidth || false),
          cellBorderStyle: fromCells(cellBorderStyle),
          rowMinHeight: target ? rowMinHeightState(target) : false,
          ...(target ? tableHeaders(target.table) : { headerRow: false, headerColumn: false }),
          caption: target ? tableCaption(target.table) : false,
          width: target ? tableWidth(target.table) : false,
          alignment: target ? tableAlignment(target.table) : false,
          cellBackground: fromCells((cell) => cell.style.backgroundColor || false),
          cellBorder: fromCells((cell) => cell.style.borderColor || false),
          cellVerticalAlign: fromCells(cellVerticalAlign),
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
