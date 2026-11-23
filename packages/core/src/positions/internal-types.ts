import type { EditorPositionChange, EditorPositions, TextMappingStep } from './types.js';

export interface PositionRecord {
  index: number;
  association: -1 | 1;
  deleted: boolean;
  active: boolean;
}

export interface PreparedTextMapping {
  readonly before: string;
  readonly after: string;
  readonly steps: readonly TextMappingStep[];
  readonly inverse: readonly TextMappingStep[];
}

export interface PositionRegistryOptions {
  surface: HTMLElement;
  isAvailable: () => boolean;
  canCapture: () => boolean;
  clearDocument: () => void;
  readDocument: () => import('../document/types.js').EditorDocument;
  canPresent: (node: HTMLElement) => boolean;
}

export interface PositionRegistry {
  positions: EditorPositions;
  accept(mapping: PreparedTextMapping | undefined, structural?: PreparedStructuralMapping): void;
  invalidate(): void;
  synchronize(): void;
  notify(): void;
  destroy(): void;
}

export interface PositionNotificationQueue {
  current?: EditorPositionChange;
}

export interface NodePositionRecord {
  path: number[];
  offset: number;
  association: -1 | 1;
  deleted: boolean;
  active: boolean;
}
export type StructuralPositionStep =
  | { kind: 'split'; path: readonly number[]; offset: number }
  | { kind: 'join'; path: readonly number[]; offset: number }
  | { kind: 'insert'; parent: readonly number[]; index: number; count: number }
  | { kind: 'remove'; path: readonly number[] }
  | { kind: 'move'; path: readonly number[]; parent: readonly number[]; index: number };
export interface PreparedStructuralMapping {
  readonly beforeHTML: string;
  readonly afterHTML: string;
  readonly steps: readonly StructuralPositionStep[];
  readonly inverse: readonly StructuralPositionStep[];
}
