import type { EditorSelectionHandles } from './types.js';

export interface SelectionHandlePoints {
  start: Node;
  startOffset: number;
  end: Node;
  endOffset: number;
  backward: boolean;
}

export interface SelectionHandleRecord {
  points?: SelectionHandlePoints;
}

export interface SelectionHandleRegistryOptions {
  surface: HTMLElement;
  isAvailable: () => boolean;
  canCapture: () => boolean;
  canRestore: () => boolean;
}

export interface SelectionHandleRegistry {
  selection: EditorSelectionHandles;
  invalidate: () => void;
  synchronize: () => void;
  destroy: () => void;
}
