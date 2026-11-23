import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg-core';

export type FormulaNode =
  | { readonly type: 'row'; readonly children: readonly FormulaNode[] }
  | { readonly type: 'identifier' | 'number' | 'operator'; readonly text: string }
  | { readonly type: 'fraction'; readonly numerator: FormulaNode; readonly denominator: FormulaNode }
  | { readonly type: 'root'; readonly value: FormulaNode }
  | { readonly type: 'scripts'; readonly base: FormulaNode; readonly sub?: FormulaNode; readonly sup?: FormulaNode };
export interface FormulaCommands {
  insert(source: string): boolean;
  update(target: HTMLElement, source: string): boolean;
  remove(target: HTMLElement): boolean;
}
export interface FormulaRenderOptions {
  readonly display?: 'inline' | 'block';
}
export type FormulaSchema = readonly SchemaNodeSpec[];
