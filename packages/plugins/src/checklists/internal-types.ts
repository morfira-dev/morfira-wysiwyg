export interface ChecklistRangePoint {
  readonly node: Node;
  readonly offset: number;
}

export interface ChecklistNativeRange {
  readonly start: ChecklistRangePoint;
  readonly end: ChecklistRangePoint;
  readonly backward: boolean;
}

export interface ChecklistInteractionReceipt {
  readonly item: HTMLLIElement;
  readonly checked: string;
  readonly revision: number;
  readonly domRevision: number;
  readonly selection?: ChecklistNativeRange;
}

export interface ChecklistPointerIntent {
  readonly receipt: ChecklistInteractionReceipt;
  readonly pointerId: number;
  released: boolean;
}
