import type { DocumentNode } from '@morfira-dev/wysiwyg-core';

export interface MarkdownExportEntry {
  readonly node: DocumentNode;
  readonly depth: number;
  readonly inTable: boolean;
}
