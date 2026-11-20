export interface CharacterTarget {
  readonly range: Range;
  readonly start: Node;
  readonly startOffset: number;
  readonly end: Node;
  readonly endOffset: number;
  readonly backward: boolean;
  readonly revision: number;
}
