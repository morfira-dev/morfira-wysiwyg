import type { EditorDocument, SchemaContribution } from '@morfira-dev/wysiwyg-core';

export interface ContentViewOptions {
  readonly value?: string | EditorDocument;
  readonly schema?: readonly SchemaContribution[];
  readonly images?: 'omit' | 'load';
  readonly links?: 'text' | 'navigate';
  readonly label?: string;
  readonly imagePlaceholder?: string;
}

export interface ContentViewController {
  readonly element: HTMLElement;
  readonly setHTML: (html: string) => void;
  readonly setJSON: (value: EditorDocument) => void;
  readonly getHTML: () => string;
  readonly getJSON: () => EditorDocument;
  readonly destroy: () => void;
}
