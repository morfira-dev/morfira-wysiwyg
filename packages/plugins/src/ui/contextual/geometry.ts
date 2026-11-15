import type { ContextualBounds } from './internal-types.js';

export const contextualViewport = (document: Document): ContextualBounds => {
  const view = document.defaultView!;
  const viewport = view.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  return { left, top, right: left + (viewport?.width ?? view.innerWidth), bottom: top + (viewport?.height ?? view.innerHeight) };
};

/** Intersect only the editor's ancestor chain; no document traversal or clones. */
export const contextualAnchor = (surface: HTMLElement, range: Range): ContextualBounds | undefined => {
  const view = surface.ownerDocument.defaultView!;
  const viewport = contextualViewport(surface.ownerDocument);
  const clip = { ...viewport };
  const common = range.commonAncestorContainer;
  const ancestor = common.nodeType === 1 ? common as HTMLElement : common.parentElement;
  for (let node: HTMLElement | null = ancestor; node; node = node.parentElement) {
    if (node === surface.ownerDocument.documentElement || node === surface.ownerDocument.scrollingElement) continue;
    const style = view.getComputedStyle(node);
    const box = node.getBoundingClientRect();
    if (node === surface || /^(auto|scroll|hidden|clip)$/.test(style.overflowX)) {
      clip.left = Math.max(clip.left, box.left + node.clientLeft);
      clip.right = Math.min(clip.right, box.left + node.clientLeft + node.clientWidth);
    }
    if (node === surface || /^(auto|scroll|hidden|clip)$/.test(style.overflowY)) {
      clip.top = Math.max(clip.top, box.top + node.clientTop);
      clip.bottom = Math.min(clip.bottom, box.top + node.clientTop + node.clientHeight);
    }
  }
  for (const rect of range.getClientRects()) {
    if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) continue;
    const bounds = { left: Math.max(rect.left, clip.left), top: Math.max(rect.top, clip.top), right: Math.min(rect.right, clip.right), bottom: Math.min(rect.bottom, clip.bottom) };
    if (bounds.right > bounds.left && bounds.bottom > bounds.top) return bounds;
  }
};

export const placeContextualToolbar = (element: HTMLElement, anchor: ContextualBounds, gap: number): void => {
  const viewport = contextualViewport(element.ownerDocument);
  const margin = 8;
  element.style.maxWidth = `${Math.max(0, viewport.right - viewport.left - margin * 2)}px`;
  element.style.maxHeight = `${Math.max(0, viewport.bottom - viewport.top - margin * 2)}px`;
  const box = element.getBoundingClientRect();
  const left = (anchor.left + anchor.right - box.width) / 2;
  const above = anchor.top - gap - box.height;
  const top = above >= viewport.top + margin ? above : anchor.bottom + gap;
  element.style.left = `${Math.max(viewport.left + margin, Math.min(left, viewport.right - margin - box.width))}px`;
  element.style.top = `${Math.max(viewport.top + margin, Math.min(top, viewport.bottom - margin - box.height))}px`;
};
