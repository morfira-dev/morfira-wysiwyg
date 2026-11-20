export interface ContextualLinkURL {
  display: string;
  href: string;
}

export interface ContextualAnchorTarget {
  readonly kind: 'anchor';
  readonly anchor: HTMLAnchorElement;
  readonly range: Range;
  url: ContextualLinkURL;
}

export interface ContextualRangeTarget {
  readonly kind: 'range';
  readonly flow: HTMLElement;
  readonly anchors: readonly HTMLAnchorElement[];
  readonly range: Range;
}

export type ContextualLinkTarget = ContextualAnchorTarget | ContextualRangeTarget;
