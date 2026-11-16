const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br']);

/** Shared ordinary-block inline shape; callers retain their own ownership and semantic guards. */
export const inlineSourceChildren = (element: Element): boolean => [...element.childNodes].every((node) => node.nodeType === 3
  || (node instanceof HTMLElement && inlineTags.has(node.localName) && inlineSourceChildren(node)));
