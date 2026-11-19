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
