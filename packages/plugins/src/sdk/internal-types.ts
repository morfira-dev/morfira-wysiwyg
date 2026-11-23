import type { Editor, SchemaNodeSpec } from '@morfira-dev/wysiwyg-core';
import type { NodeCommands } from './types.js';

export interface NodeExtensionRegistration {
  readonly spec: SchemaNodeSpec;
  readonly commands: NodeCommands;
  owns(node: Element): node is HTMLElement;
}
export interface AtomicContext {
  readonly name: string;
  readonly editor: Editor;
  owns(node: Element): node is HTMLElement;
}
export interface NativeRange {
  readonly selection: Selection;
  readonly range: Range;
  readonly backward: boolean;
}
export interface HighlightPlatform {
  readonly Highlight?: typeof Highlight;
  readonly CSS?: { readonly highlights?: HighlightRegistry };
}
