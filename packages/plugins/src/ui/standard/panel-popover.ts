import { listenToUI } from '../shared/events.js';
import type { TablePopoverController } from './internal-types.js';

/** Own only transient panel geometry; selection remains with Standard UI. */
export const createAnchoredPanel = (
  panel: HTMLElement,
  getAnchor: () => HTMLElement | undefined,
  preferredWidth = 280,
): TablePopoverController => {
  const view = panel.ownerDocument.defaultView;
  if (!view) throw new Error('An anchored panel requires a browser window.');
  const properties = ['position', 'inset', 'left', 'top', 'right', 'bottom', 'margin', 'width', 'max-width', 'max-height', 'overflow', 'box-sizing', 'z-index', 'visibility'] as const;
  const previous = properties.map((name) => [name, panel.style.getPropertyValue(name), panel.style.getPropertyPriority(name)] as const);
  const oldPopover = panel.getAttribute('popover');
  let disposed = false;
  let native = false;
  panel.classList.add('mw-ui-panel-popover');
  Object.assign(panel.style, {
    position: 'fixed', inset: 'auto', margin: '0', overflow: 'auto',
    boxSizing: 'border-box', zIndex: '1000',
  });
  if (typeof panel.showPopover === 'function' && typeof panel.hidePopover === 'function') {
    try {
      panel.setAttribute('popover', 'manual');
      panel.showPopover();
      native = true;
    }
    catch {
      panel.removeAttribute('popover');
    }
  }
  const refresh = () => {
    if (disposed) return;
    const anchor = getAnchor();
    if (!anchor?.isConnected || !panel.isConnected) {
      panel.style.visibility = 'hidden';
      return;
    }
    panel.style.visibility = '';
    const viewport = view.visualViewport;
    const width = viewport?.width ?? view.innerWidth;
    const height = viewport?.height ?? view.innerHeight;
    const originX = viewport?.offsetLeft ?? 0;
    const originY = viewport?.offsetTop ?? 0;
    const gutter = Math.min(20, width / 4, height / 4);
    const availableWidth = Math.max(0, width - gutter * 2);
    panel.style.width = `${Math.min(preferredWidth, availableWidth)}px`;
    panel.style.maxWidth = `${availableWidth}px`;
    panel.style.maxHeight = `${Math.max(0, height - gutter * 2)}px`;
    const bounds = anchor.getBoundingClientRect();
    const popup = panel.getBoundingClientRect();
    const right = originX + width - gutter;
    const bottom = originY + height - gutter;
    const below = bounds.bottom + 6;
    const above = bounds.top - popup.height - 6;
    const top = below + popup.height <= bottom || above < originY + gutter ? below : above;
    panel.style.left = `${Math.max(originX + gutter, Math.min(bounds.left, right - popup.width))}px`;
    panel.style.top = `${Math.max(originY + gutter, Math.min(top, bottom - popup.height))}px`;
  };
  const stops = [
    listenToUI(view, 'resize', refresh),
    listenToUI(panel.ownerDocument, 'scroll', refresh, true),
  ];
  if (view.visualViewport) stops.push(
    listenToUI(view.visualViewport, 'resize', refresh),
    listenToUI(view.visualViewport, 'scroll', refresh),
  );
  const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(refresh) : undefined;
  observer?.observe(panel);
  const anchor = getAnchor();
  if (anchor) observer?.observe(anchor);
  refresh();
  return {
    refresh,
    destroy: () => {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      for (const stop of stops) stop();
      if (native) {
        try { panel.hidePopover(); }
        catch { /* A detached panel may already have left the top layer. */ }
      }
      if (oldPopover === null) panel.removeAttribute('popover');
      else panel.setAttribute('popover', oldPopover);
      panel.classList.remove('mw-ui-panel-popover');
      for (const [name, value, priority] of previous) {
        if (value) panel.style.setProperty(name, value, priority);
        else panel.style.removeProperty(name);
      }
    },
  };
};
