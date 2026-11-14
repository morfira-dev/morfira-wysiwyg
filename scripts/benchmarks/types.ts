import type { EditorDocument } from '@morfira-dev/wysiwyg-core';

export type BenchmarkParagraphs = 100 | 1000 | 5000;

export interface BenchmarkFixtureCounts {
  /** Concatenated schema text nodes, without layout-dependent block separators. */
  textContent: string;
  textLength: number;
  paragraphCount: number;
  tableCount: number;
  /** Physical cells: merged cells count once. */
  cellCount: number;
  nodeCount: number;
  /** Root children have zero-based depth zero. */
  maxDepth: number;
}

export interface BenchmarkFixture {
  id: string;
  /** Main paragraphs, excluding table-cell paragraphs. */
  paragraphs: BenchmarkParagraphs;
  html: string;
  document: EditorDocument;
  expected: BenchmarkFixtureCounts;
  search: {
    query: string;
    matches: number;
  };
  target: {
    index: number;
    length: number;
    text: string;
  };
}
