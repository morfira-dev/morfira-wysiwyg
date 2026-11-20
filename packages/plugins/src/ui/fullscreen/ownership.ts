import type { OverflowAxisSnapshot } from './internal-types.js';

// Only the temporary document scroll lock is shared. Editor state stays local.
const owners = new WeakMap<Document, symbol>();
export const claimFullscreenDocument = (document: Document, owner: symbol): boolean => {
  if (owners.has(document)) return false;
  owners.set(document, owner);
  return true;
};
export const releaseFullscreenDocument = (document: Document, owner: symbol): void => {
  if (owners.get(document) === owner) owners.delete(document);
};
export const lockFullscreenScroll = (body: HTMLElement): readonly OverflowAxisSnapshot[] => {
  const snapshots = (['overflow-x', 'overflow-y'] as const).map((property) => ({
    property, value: body.style.getPropertyValue(property), priority: body.style.getPropertyPriority(property),
  }));
  try {
    for (const { property } of snapshots) body.style.setProperty(property, 'hidden', 'important');
  }
  catch (error) {
    restoreFullscreenScroll(body, snapshots);
    throw error;
  }
  return snapshots;
};
export const restoreFullscreenScroll = (body: HTMLElement, snapshots: readonly OverflowAxisSnapshot[]): void => {
  for (const { property, value, priority } of snapshots) {
    if (body.style.getPropertyValue(property) !== 'hidden' || body.style.getPropertyPriority(property) !== 'important') continue;
    if (value) body.style.setProperty(property, value, priority);
    else body.style.removeProperty(property);
  }
};
