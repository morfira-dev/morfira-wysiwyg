import type { BenchmarkFixture, BenchmarkFixtureCounts } from './types.js';

export type BenchmarkBrowser = 'chromium' | 'firefox' | 'webkit';
export type BenchmarkProfile = 'core' | 'search' | 'statistics';
export interface InputMeasurement { dispatchMs: number; frameOpportunityMs: number; }
export interface BenchmarkBridge {
  mount: (html: string, profile: BenchmarkProfile, historyLimit?: number) => number;
  replace: (html: string) => number;
  inspect: () => BenchmarkFixtureCounts;
  select: (index: number, length?: number) => number;
  format: () => number;
  verifyFormatted: (target: string, expectedText: string) => void;
  verifyNativeInput: (expectedText: string) => void;
  undo: () => number;
  redo: () => number;
  html: () => string;
  exportHTML: () => number;
  search: (query: string, expected: number) => number;
  armInput: () => void;
  finishInput: () => Promise<InputMeasurement>;
  history: (edits: number) => number;
  verifyHistory: (expected: number) => void;
  clearHistory: () => void;
  dispose: () => number;
  verify: (fixture: BenchmarkFixture) => void;
}
export interface SampleSummary { samples: number[]; median: number; p95: number; max: number; }
export interface BenchmarkCase {
  fixture: string;
  paragraphs: number;
  profile: BenchmarkProfile;
  htmlUTF16Units: number;
  htmlUTF8Bytes: number;
  schemaNodes: number;
  metrics: Record<string, SampleSummary>;
}
export interface HeapMetrics { jsHeapUsed: number; domNodes: number; documents: number; listeners: number; }
export interface HistoryObservation {
  historyLimit: number;
  edits: number;
  before: HeapMetrics;
  edited: HeapMetrics;
  cleared: HeapMetrics;
  destroyed: HeapMetrics;
  restoredUndoSteps: number;
}
