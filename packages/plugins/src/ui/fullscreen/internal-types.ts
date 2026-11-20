export interface OverflowAxisSnapshot {
  readonly property: 'overflow-x' | 'overflow-y';
  readonly value: string;
  readonly priority: string;
}

export interface FullscreenSelection {
  readonly range: Range;
  readonly revision: number;
  readonly start: Node;
  readonly startOffset: number;
  readonly end: Node;
  readonly endOffset: number;
}

export interface FullscreenWindowScroll {
  readonly entryX: number;
  readonly entryY: number;
  readonly lockedX: number;
  readonly lockedY: number;
}
