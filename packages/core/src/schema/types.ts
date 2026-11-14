import type { DocumentTag, EditorDocument } from '../document/types.js';

export type SchemaAttributeSpec =
  | { readonly type: 'text'; readonly maxLength?: number; readonly required?: boolean }
  | { readonly type: 'enum'; readonly values: readonly string[]; readonly required?: boolean }
  | { readonly type: 'integer'; readonly min: number; readonly max: number; readonly required?: boolean }
  | { readonly type: 'url'; readonly required?: boolean };

export interface SchemaNodeSpec {
  readonly name: string;
  readonly kind: 'block' | 'inline';
  readonly tag: DocumentTag;
  readonly attributes?: Readonly<Record<string, SchemaAttributeSpec>>;
}

/** A compiled immutable schema with safe HTML/JSON import and rendering boundaries. */
export interface DocumentSchema {
  readonly parseHTML: (html: string) => EditorDocument;
  readonly validateDocument: (input: unknown) => EditorDocument;
  readonly renderDocument: (value: EditorDocument) => DocumentFragment;
  readonly documentHTML: (value: EditorDocument) => string;
  readonly sanitizeHTML: (html: string) => string;
}
