export const sameContextualRange = (a: Range, b: Range): boolean => a.startContainer === b.startContainer && a.startOffset === b.startOffset
  && a.endContainer === b.endContainer && a.endOffset === b.endOffset;
