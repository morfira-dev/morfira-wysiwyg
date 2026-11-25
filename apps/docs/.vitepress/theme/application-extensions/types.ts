import type { Editor, EditorDocument, EditorPlugin, SchemaNodeSpec } from '@morfira-dev/wysiwyg';
import type { NodeCommands } from '@morfira-dev/wysiwyg/sdk';

export type ApplicationNodeKind = 'entity' | 'callout' | 'variable';
export type ApplicationVariableKey = 'customer' | 'order';
export interface ApplicationNodeTarget {
  readonly editor: Editor;
  readonly kind: ApplicationNodeKind;
  readonly node: HTMLElement;
  readonly html: string;
  readonly revision: number;
}
export interface ApplicationExpansion {
  readonly document: EditorDocument;
  readonly unresolved: readonly ApplicationVariableKey[];
}
export interface ApplicationExtensionBundle {
  readonly schema: readonly SchemaNodeSpec[];
  readonly plugins: EditorPlugin[];
  commands(editor: Editor, kind: ApplicationNodeKind): NodeCommands;
  capture(editor: Editor, kind: ApplicationNodeKind, node: HTMLElement): ApplicationNodeTarget | undefined;
  isCurrent(target: ApplicationNodeTarget): boolean;
  update(target: ApplicationNodeTarget, text: string, attributes: Readonly<Record<string, string>>): boolean;
  remove(target: ApplicationNodeTarget): boolean;
  expand(document: EditorDocument, values: Readonly<Partial<Record<ApplicationVariableKey, string>>>): ApplicationExpansion;
}

export interface ApplicationDraftRevision {
  revision: number;
  disposed: boolean;
}
