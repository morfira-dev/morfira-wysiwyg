export interface TextSelection {
  index: number;
  length: number;
}
export interface SelectionBookmark {
  start: number[];
  startOffset: number;
  end: number[];
  endOffset: number;
  backward: boolean;
}
