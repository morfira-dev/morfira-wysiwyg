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
}

export interface EditorMappedPosition {
  readonly index: number;
  readonly deleted: boolean;
}

export interface EditorPositionChange {
  readonly kind: 'mapped' | 'invalidated';
  readonly steps: readonly TextMappingStep[];
}

export interface EditorPositions {
  track(index: number, association?: -1 | 1): EditorPositionHandle | undefined;
  resolve(handle: EditorPositionHandle): EditorMappedPosition | undefined;
  release(handle: EditorPositionHandle): void;
  subscribe(listener: (change: EditorPositionChange) => void): () => void;
}
