export interface ContextualLinkURL {
  display: string;
  href: string;
}

export interface ContextualLinkTarget {
  anchor: HTMLAnchorElement;
  range: Range;
  url: ContextualLinkURL;
}
