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
  readonly leaves: readonly HTMLElement[];
  readonly parent: HTMLElement | null;
  readonly start: AtomicPoint;
  readonly end: AtomicPoint;
  readonly range: Range;
  readonly backward: boolean;
  readonly revision: number;
  readonly domRevision: number;
  readonly list?: AtomicClipboardListSelection;
}

export interface AtomicClipboardListItem {
  readonly item: HTMLLIElement;
  readonly bodies: readonly HTMLElement[];
  readonly branches: readonly HTMLElement[];
  readonly direct: boolean;
}

export interface AtomicClipboardListSelection {
  readonly list: HTMLElement;
  readonly items: readonly AtomicClipboardListItem[];
  readonly firstBody: HTMLElement;
  readonly lastBody: HTMLElement;
}
