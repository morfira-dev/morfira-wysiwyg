import type { DocumentTag } from '../document/types.js';

export interface CompiledAttribute {
  readonly required: boolean;
  readonly read: (value: unknown) => string;
}

export interface CompiledSchemaNode {
  readonly tag: DocumentTag;
  readonly attributes: ReadonlyMap<string, CompiledAttribute>;
  readonly content?: CompiledTextContent;
}

export interface CompiledTextContent {
  readonly maxLength: number;
  readonly rule: CompiledAttribute;
}
