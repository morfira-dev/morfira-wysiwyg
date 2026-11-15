import type { EditorUIOverflow, EditorUIOverflowOptions } from './internal-types.js';

const counters = new WeakMap<Document, number>();

export const createEditorUIOverflow = ({ element, toolbar, groups, priorities, label, capture, updateTabs }: EditorUIOverflowOptions): EditorUIOverflow => {
  const document = element.ownerDocument;
  const view = document.defaultView!;
  let next = counters.get(document) ?? 0;
  do { next++; } while (document.getElementById(`mw-ui-overflow-${next}`));
  counters.set(document, next);
  const region = document.createElement('section');
  region.id = `mw-ui-overflow-${next}`;
  region.className = 'mw-ui-overflow';
  region.setAttribute('role', 'region');
  region.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mw-ui-button mw-ui-more';
  button.dataset.mwUiMore = '';
  button.setAttribute('aria-controls', region.id);
  button.setAttribute('aria-expanded', 'false');
  button.hidden = true;
  toolbar.append(button);
  toolbar.after(region);
  element.dataset.overflow = 'more';
  let disposed = false;
  let frame = 0;
  const close = (restoreFocus = false): void => {
    if (disposed) return;
    region.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !button.hidden) button.focus();
    updateTabs();
  };
  const refresh = (): void => {
    if (disposed) return;
    const name = label();
    button.textContent = name;
    button.setAttribute('aria-label', name);
    region.setAttribute('aria-label', name);
    const style = view.getComputedStyle(toolbar);
    const available = toolbar.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
    if (available <= 0) return;
    const gap = parseFloat(style.columnGap) || 0;
    let widths: number[];
    let moreWidth: number;
    element.classList.add('mw-ui-measuring');
    try {
      widths = groups.map((group) => group.getBoundingClientRect().width);
      moreWidth = button.getBoundingClientRect().width;
    }
    finally { element.classList.remove('mw-ui-measuring'); }
    const hidden = new Set<number>();
    let total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, groups.length - 1);
    if (total > available) {
      total += moreWidth + gap;
      const order = groups.map((_, index) => index).sort((a, b) => priorities[a] - priorities[b] || b - a);
      for (const index of order) {
        if (total <= available) break;
        hidden.add(index);
        total -= widths[index] + gap;
      }
    }
    // Never reparent a focused native control. Temporary wrapping is intentional.
    groups.forEach((group, index) => {
      if (!group.contains(document.activeElement)) return;
      if (group.parentElement === region) hidden.add(index);
      else hidden.delete(index);
    });
    groups.forEach((group, index) => {
      const parent = hidden.has(index) ? region : toolbar;
      if (group.parentElement === parent) return;
      const following = groups.find((candidate, other) => other > index && candidate.parentElement === parent && hidden.has(other) === hidden.has(index));
      parent.insertBefore(group, following ?? (parent === toolbar ? button : null));
    });
    button.hidden = hidden.size === 0 && document.activeElement !== button;
    if (!hidden.size) close();
    updateTabs();
  };
  const schedule = (): void => {
    if (disposed || frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  };
  const pointer = (event: PointerEvent): void => {
    capture();
    event.preventDefault();
  };
  const toggle = (event: MouseEvent): void => {
    if (disposed || button.hidden) return;
    const open = region.hidden;
    region.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    updateTabs();
    if (open && event.detail === 0)
      region.querySelector<HTMLElement>('button:enabled,select:enabled,input:enabled')?.focus();
  };
  const escape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || region.hidden || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };
  // In-flow dismissal must wait until the click target is fixed: collapsing on
  // pointerdown can move that target before mouseup and swallow its activation.
  const outside = (event: MouseEvent): void => {
    if (!region.hidden && !region.contains(event.target as Node) && !button.contains(event.target as Node)) close();
  };
  let observer: ResizeObserver | undefined;
  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    if (frame) view.cancelAnimationFrame(frame);
    button.removeEventListener('pointerdown', pointer);
    button.removeEventListener('click', toggle);
    element.removeEventListener('keydown', escape);
    element.removeEventListener('focusout', schedule);
    document.removeEventListener('click', outside, true);
  };
  try {
    button.addEventListener('pointerdown', pointer);
    button.addEventListener('click', toggle);
    element.addEventListener('keydown', escape);
    element.addEventListener('focusout', schedule);
    document.addEventListener('click', outside, true);
    observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : undefined;
    observer?.observe(toolbar);
  }
  catch (error) {
    destroy();
    throw error;
  }
  return { button, region, refresh, close, destroy };
};
