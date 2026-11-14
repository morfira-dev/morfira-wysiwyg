export interface ListItemBoundary {
  item: HTMLLIElement;
  body: HTMLElement;
  ownNodes: ChildNode[];
  nestedLists: HTMLElement[];
  ownStart: Range;
  ownEnd: Range;
  ownEmpty: boolean;
}

export interface ListSelectionPlan {
  status: 'eligible';
  range: Range;
  leaves: HTMLLIElement[];
  gaps: ChildNode[];
  first: ListItemBoundary;
  last: ListItemBoundary;
}

export type ListSelectionResult =
  | { status: 'unowned' }
  | { status: 'blocked'; reason: string }
  | ListSelectionPlan;
