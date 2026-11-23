import type { Editor, EditorPlugin, SchemaNodeSpec } from '@morfira-dev/wysiwyg-core';
import { nodeExtension, nodeCommands } from '../sdk/index.js';
import { parseFormula } from './parser.js';
import type { FormulaCommands, FormulaSchema } from './types.js';

export { parseFormula } from './parser.js';
export { renderFormula } from './render.js';
export type { FormulaNode, FormulaCommands, FormulaRenderOptions, FormulaSchema } from './types.js';
export const formulaNodeName = 'morfira:formula';
export const createFormulaSchema = (): FormulaSchema => [{ name: formulaNodeName, kind: 'inline', tag: 'span',
  content: { type: 'text', minLength: 1, maxLength: 1024, singleLine: true } } satisfies SchemaNodeSpec];

export const formulas = (): EditorPlugin => nodeExtension(createFormulaSchema()[0], { atomic: true });

export const formulaCommands = (editor: Editor): FormulaCommands => {
  const commands = nodeCommands(editor, formulaNodeName);
  return {
    insert: (source) => { parseFormula(source); return commands.insert(source); },
    update: (target, source) => { parseFormula(source); return commands.update(target, {}, source); },
    remove: commands.remove,
  };
};
