export interface ListItemBoundary {
  item: HTMLLIElement;
  ownNodes: ChildNode[];
  nestedLists: HTMLElement[];
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
