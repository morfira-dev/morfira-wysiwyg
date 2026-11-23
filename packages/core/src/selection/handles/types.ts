declare const selectionHandleBrand: unique symbol;

/** Opaque identity for one editor's unchanged native selection boundaries. */
export interface EditorSelectionHandle {
  readonly [selectionHandleBrand]: true;
}

export interface EditorSelectionHandles {
  capture(): EditorSelectionHandle | undefined;
  isCurrent(handle: EditorSelectionHandle): boolean;
  getRange(handle: EditorSelectionHandle): Range | undefined;
  /** Restore native selection without explicitly focusing; the browser may focus. */
  restore(handle: EditorSelectionHandle): boolean;
  release(handle: EditorSelectionHandle): void;
}
