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
  canPresent: (node: HTMLElement) => boolean;
}

export interface PositionRegistry {
  positions: EditorPositions;
  accept(mapping: PreparedTextMapping | undefined): void;
  invalidate(): void;
  synchronize(): void;
  notify(): void;
  destroy(): void;
}

export interface PositionNotificationQueue {
  current?: EditorPositionChange;
}
