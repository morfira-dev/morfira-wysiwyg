/** Resolve an image from an already owned native or saved range. Callers retain
 * responsibility for range validation, revision checks and command authority. */
export const selectedImageFromRange = (surface: HTMLElement, range: Range | undefined): HTMLImageElement | undefined => {
  if (!range) return;
  const start = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const caption = start?.closest('figcaption');
  if (range.collapsed && caption && surface.contains(caption) && caption.parentElement?.querySelectorAll('img').length === 1)
    return caption.parentElement.querySelector('img') ?? undefined;
  if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== 1 || range.endOffset !== range.startOffset + 1) return;
  const node = range.startContainer.childNodes[range.startOffset];
  if (node instanceof HTMLImageElement) return node;
  if (node instanceof HTMLElement && node.localName === 'figure' && node.querySelectorAll('img').length === 1)
    return node.querySelector('img') ?? undefined;
};
