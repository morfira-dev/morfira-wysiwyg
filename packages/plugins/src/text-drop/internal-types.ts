export type CaretPointDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};
export interface DragPayload {
  readonly html: string;
  readonly text: string;
}
export interface DragSession extends DragPayload {
  readonly token: string;
  readonly range: Range;
  readonly rangeText: string;
  readonly flow: HTMLElement;
  readonly revision: number;
  readonly backward: boolean;
}
