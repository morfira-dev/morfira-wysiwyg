import type { DocumentTag, EditorDocument } from '../document/types.js';

export type SchemaAttributeSpec =
  | { readonly type: 'text'; readonly minLength?: number; readonly maxLength?: number; readonly singleLine?: boolean; readonly required?: boolean }
  | { readonly type: 'enum'; readonly values: readonly string[]; readonly required?: boolean }
  | { readonly type: 'integer'; readonly min: number; readonly max: number; readonly required?: boolean }
  | { readonly type: 'url'; readonly required?: boolean };

export type SchemaTextContentSpec = Omit<Extract<SchemaAttributeSpec, { type: 'text' }>, 'required'>;

export interface SchemaNodeSpec {
  readonly name: string;
  readonly kind: 'block' | 'inline';
  readonly tag: DocumentTag;
  readonly attributes?: Readonly<Record<string, SchemaAttributeSpec>>;
  readonly content?: SchemaTextContentSpec;
}

type OptionalSchemaAttributeSpec = SchemaAttributeSpec & { readonly required?: false };

export interface SchemaAttributesSpec {
  readonly name: string;
  readonly kind: 'attributes';
  readonly tag: DocumentTag;
  readonly attributes: Readonly<Record<string, OptionalSchemaAttributeSpec>>;
  readonly split?: Readonly<Record<string, string>>;
}

export type SchemaContribution = SchemaNodeSpec | SchemaAttributesSpec;

/** A compiled immutable schema with safe HTML/JSON import and rendering boundaries. */
export interface DocumentSchema {
  /** Reset patches for present registered attributes on an owned LI split. */
  readonly attributesForSplit: (tag: DocumentTag, attributes: Readonly<Record<string, string>>) => Record<string, string>;
  readonly parseHTML: (html: string) => EditorDocument;
  readonly validateDocument: (input: unknown) => EditorDocument;
  readonly renderDocument: (value: EditorDocument) => DocumentFragment;
  readonly documentHTML: (value: EditorDocument) => string;
  readonly sanitizeHTML: (html: string) => string;
}
