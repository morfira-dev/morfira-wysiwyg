export interface ListItemBoundary {
  item: HTMLLIElement;
  body: HTMLElement;
  bodies: HTMLElement[];
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
  startBody: HTMLElement;
  endBody: HTMLElement;
  quote?: QuotePasteContext;
  crossing?: QuoteCrossingContext;
}

export interface QuoteCrossingContext {
  startRoot: HTMLElement;
  endRoot: HTMLElement;
  startQuoteBody?: HTMLElement;
  endQuoteBody?: HTMLElement;
  range: Range;
  covered: HTMLElement[];
}

export interface QuotePasteContext {
  container: HTMLElement;
  bodies: HTMLElement[];
  range: Range;
  startBody: HTMLElement;
  endBody: HTMLElement;
  gaps: ChildNode[];
}

export interface QuoteBodyPoint {
  body: HTMLElement;
  range: Range;
}

export type ListSelectionResult =
  | { status: 'unowned' }
  | { status: 'blocked'; reason: string }
  | ListSelectionPlan;

export interface ListSelectionOptions {
  includeSameBody: boolean;
  includeCollapsed: boolean;
  preserveQuotes: boolean;
}
