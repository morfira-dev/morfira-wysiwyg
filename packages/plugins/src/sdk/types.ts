import type { Editor, EditorPlugin, SchemaNodeSpec } from '@morfira-dev/wysiwyg-core';

export interface NodeExtensionOptions {
  readonly atomic?: boolean;
}
export interface NodeCommands {
  insert(text: string, attributes?: Readonly<Record<string, string>>): boolean;
  update(target: HTMLElement, attributes: Readonly<Record<string, string>>, text?: string): boolean;
  remove(target: HTMLElement): boolean;
}
export interface NodeViewContext {
  readonly editor: Editor;
  readonly node: HTMLElement;
  readonly attributes: Readonly<Record<string, string>>;
  readonly text: string;
  getRect(): DOMRect | undefined;
}
export interface NodeView {
  readonly element: HTMLElement;
  update?(context: NodeViewContext): void;
  destroy?(): void;
}
export interface NodeViewsOptions {
  readonly name: string;
  readonly create: (context: NodeViewContext) => NodeView;
}
export interface NodeViewsController {
  refresh(): void;
  destroy(): void;
}
export interface DecorationRange {
  readonly from: number;
  readonly to: number;
}
export interface DecorationsOptions {
  readonly name: string;
}
export interface DecorationsState {
  readonly status: 'ready' | 'unsupported' | 'conflict';
  readonly count: number;
}
export interface DecorationsController {
  set(ranges: readonly DecorationRange[]): boolean;
  getState(): DecorationsState;
  refresh(): void;
  destroy(): void;
}
export interface NodeExtensionFactory {
  (spec: SchemaNodeSpec, options?: NodeExtensionOptions): EditorPlugin;
}

export interface InlineNodeViewsOptions {
  readonly name: string;
  readonly create: (context: NodeViewContext) => NodeView;
  readonly onError?: (error: unknown) => void;
}
export interface InlineNodeViewsController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}
