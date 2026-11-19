export interface AtomicPoint {
  readonly node: Node;
  readonly offset: number;
}

export interface AtomicSelection {
  readonly range: Range;
  readonly native: Selection;
  readonly backward: boolean;
}

export interface AtomicPresentation {
  flush(): void;
  destroy(): void;
}

export interface AtomicClipboardContext {
  ready(): boolean;
  revision(): number;
  transact(mutate: () => void): void;
}

export interface AtomicClipboardSnapshot {
  readonly flow: HTMLElement;
  readonly start: AtomicPoint;
  readonly end: AtomicPoint;
  readonly range: Range;
  readonly backward: boolean;
  readonly revision: number;
  readonly domRevision: number;
}
