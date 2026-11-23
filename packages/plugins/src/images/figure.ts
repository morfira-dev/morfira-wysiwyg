/** Resolve the existing single-image figure shape. An expected ancestor is
 * checked before inspecting children, preserving resize's adjacency guard. */
export const imageFigure = (image: HTMLImageElement, expected?: Element): HTMLElement | undefined => {
  const figure = image.parentElement;
  return (!expected || figure === expected) && figure?.localName === 'figure'
    && figure.querySelectorAll('img').length === 1
    && [...figure.children].every((child) => child === image || child.localName === 'figcaption')
    && [...figure.childNodes].every((child) => child.nodeType === 1 || !child.textContent?.trim()) ? figure : undefined;
};

/** Shared mechanics only: callers retain their own figure eligibility policy. */
export const ordinaryImageAncestors = (root: HTMLElement, image: HTMLImageElement, figureAllowed?: (figure: Element) => boolean): boolean => {
  for (let node: Element | null = image; node; node = node.parentElement) {
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
    if (node === root) return true;
    if (node.hasAttribute('data-mw-node')) return false;
    if (node.localName === 'figure' && figureAllowed && !figureAllowed(node)) return false;
  }
  return false;
};

export const ordinaryImageDescendants = (figure: Element): boolean => {
  for (const child of figure.querySelectorAll('*'))
    if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml' || child.hasAttribute('data-mw-node')) return false;
  return true;
};
