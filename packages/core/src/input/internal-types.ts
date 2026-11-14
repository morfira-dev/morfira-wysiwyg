export interface SelectionReplacement {
  range: Range;
  leaves: HTMLElement[];
  contentRoots?: { left: HTMLElement; right: HTMLElement };
}

export interface CutSelectionReplacement {
  left: HTMLElement;
  right: HTMLElement;
  tail: DocumentFragment;
  caret: Range;
}
