const tags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'ul', 'ol', 'li', 'td', 'th']);

export const normalizeDirection = (tag: string, value: unknown, canonical = false): string | undefined => {
  if (!tags.has(tag) || typeof value !== 'string' || value.length > 20000) return;
  const direction = canonical ? value : value.trim().toLowerCase();
  return direction === 'ltr' || direction === 'rtl' ? direction : undefined;
};

/** Copy one validated attribute only, never application/schema metadata. */
export const copyDirection = (source: HTMLElement, target: HTMLElement): void => {
  const direction = normalizeDirection(source.localName, source.getAttribute('dir'), true);
  if (direction && normalizeDirection(target.localName, direction, true)) target.setAttribute('dir', direction);
};
