import type { ElementNode } from '../document/types.js';
declare const positionHandleBrand: unique symbol;

export interface EditorPositionHandle {
  readonly [positionHandleBrand]: true;
}

export interface TextMappingStep {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export interface EditorTransactionOptions {
  readonly mapping?: readonly TextMappingStep[];
  readonly structuralMapping?: readonly StructuralMappingStep[];
  /** Clear pending caret formats after the history snapshot, before mutation. */
  readonly resetTyping?: boolean;
}

export interface EditorMappedPosition {
  readonly index: number;
  readonly deleted: boolean;
}

export interface EditorPositionChange {
  readonly kind: 'mapped' | 'invalidated';
  readonly steps: readonly TextMappingStep[];
  readonly structural?: true;
}

export interface EditorPositions {
  trackNode(path: StructuralNodePath, offset: number, association?: -1 | 1): EditorNodePositionHandle | undefined;
  resolveNode(handle: EditorNodePositionHandle): EditorMappedNodePosition | undefined;
  releaseNode(handle: EditorNodePositionHandle): void;
  track(index: number, association?: -1 | 1): EditorPositionHandle | undefined;
  resolve(handle: EditorPositionHandle): EditorMappedPosition | undefined;
  release(handle: EditorPositionHandle): void;
  /** Account only an owned semantic span's runtime contenteditable annotation. */
  setPresentation(node: HTMLElement, editable: false | undefined): boolean;
  subscribe(listener: (change: EditorPositionChange) => void): () => void;
}

/** Element-child ordinals, excluding Text/comment nodes. */
export type StructuralNodePath = readonly number[];
declare const nodePositionBrand: unique symbol;
export interface EditorNodePositionHandle { readonly [nodePositionBrand]: true; }
export interface EditorMappedNodePosition {
  readonly path: StructuralNodePath;
  readonly offset: number;
  readonly deleted: boolean;
}
export type StructuralMappingStep =
  | { readonly kind: 'split'; readonly path: StructuralNodePath; readonly offset: number }
  | { readonly kind: 'join'; readonly path: StructuralNodePath }
  | { readonly kind: 'insert'; readonly parent: StructuralNodePath; readonly index: number; readonly nodes: readonly ElementNode[] }
  | { readonly kind: 'remove'; readonly path: StructuralNodePath }
  | { readonly kind: 'move'; readonly path: StructuralNodePath; readonly parent: StructuralNodePath; readonly index: number };
