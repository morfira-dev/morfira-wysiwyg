import type { DocumentNode, DocumentTag, ElementNode } from '@morfira-dev/wysiwyg-core';

export interface MarkdownBudget {
  nodes: number;
  work: number;
}

export interface MarkdownParserContext {
  readonly budget: MarkdownBudget;
  readonly text: (value: string, depth: number) => DocumentNode;
  readonly element: (tag: DocumentTag, children: DocumentNode[], depth: number, attributes?: Record<string, string>) => ElementNode;
  readonly references: Map<string, MarkdownReference>;
  readonly inlineTasks: MarkdownInlineTask[];
}

export interface MarkdownInlineTask {
  readonly source: string;
  readonly depth: number;
  readonly target: DocumentNode[];
}

export interface MarkdownReference {
  readonly href: string;
  readonly title?: string;
}

export interface MarkdownDestination {
  readonly end: number;
  readonly href: string;
  readonly title?: string;
}

export interface MarkdownListMarker {
  readonly kind: 'ul' | 'ol';
  readonly number: number;
  readonly content: string;
}
