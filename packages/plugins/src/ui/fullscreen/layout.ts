/** Fixed viewport layout cannot escape an ancestor that establishes its containing block. */
export const fullscreenAncestors = (target: HTMLElement): HTMLElement[] => {
  const ancestors: HTMLElement[] = [];
  for (let node = target.parentElement; node; node = node.parentElement) ancestors.push(node);
  return ancestors;
};
export const supportedFullscreenLayout = (target: HTMLElement, visible = false): boolean => {
  const view = target.ownerDocument.defaultView;
  if (!view || (visible && target.hidden)) return false;
  const ownStyle = view.getComputedStyle(target);
  if (visible && (ownStyle.display === 'none' || ownStyle.visibility === 'hidden' || ownStyle.visibility === 'collapse')) return false;
  for (const ancestor of fullscreenAncestors(target)) {
    if (ancestor.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
    const style = view.getComputedStyle(ancestor);
    if ((visible && (ancestor.hidden || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'))
      || style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none'
      || /(?:^|\s)(?:paint|layout|strict|content)(?:\s|$)/.test(style.contain)
      || /(?:transform|filter|perspective)/.test(style.willChange)
      || (style.backdropFilter && style.backdropFilter !== 'none')) return false;
  }
  return true;
};
