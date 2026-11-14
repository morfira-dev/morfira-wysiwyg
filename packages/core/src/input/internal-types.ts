export interface SelectionReplacement {
  range: Range;
  leaves: HTMLElement[];
}

export interface CutSelectionReplacement {
  left: HTMLElement;
  right: HTMLElement;
  tail: DocumentFragment;
  caret: Range;
}
