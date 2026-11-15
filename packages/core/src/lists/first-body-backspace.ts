import { activeRange } from '../selection/index.js';
import { copyDirection } from '../document/direction.js';
import { editListForwardDelete } from './forward-delete.js';
import { inspectListItem } from './selection-boundaries.js';
import type { ListItemBoundary } from './internal-types.js';
import type { FirstBodyBackspacePlan } from './first-body-backspace.types.js';

const isList = (node: Element | null): node is HTMLElement => node instanceof HTMLElement
  && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && /^(ul|ol)$/.test(node.localName);
const whitespace = (node: Node): boolean => node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent ?? '');

const supportedList = (root: HTMLElement, list: HTMLElement): boolean => isList(list)
  && !list.hasAttribute('data-mw-node')
  && [...list.childNodes].every((node) => whitespace(node)
    || (node instanceof HTMLLIElement && Boolean(inspectListItem(root, node))));

/** Resolve every changed container before opening the structural mutation. */
const firstBodyBackspacePlan = (root: HTMLElement, boundary: ListItemBoundary): FirstBodyBackspacePlan | undefined => {
  const list = boundary.item.parentElement;
  if (boundary.bodies.length < 2 || boundary.body === boundary.item || !list || !supportedList(root, list)) return;
  const previous = boundary.item.previousElementSibling;
  if (previous instanceof HTMLElement) {
    const inspected = inspectListItem(root, previous);
    return inspected ? { kind: 'join', previous: inspected } : undefined;
  }
  const parent = list.parentElement;
  if (!(parent instanceof HTMLElement) || parent.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
  if (parent === root || ['blockquote', 'td', 'th'].includes(parent.localName)) return { kind: 'unwrap', list };
  if (!(parent instanceof HTMLLIElement) || !inspectListItem(root, parent)) return;
  const outer = parent.parentElement;
  if (!outer || !supportedList(root, outer)) return;
  const laterBranches: HTMLElement[] = [];
  let branch = list.nextSibling;
  while (branch) {
    if (!(branch instanceof HTMLElement) || !supportedList(root, branch)) return;
    laterBranches.push(branch);
    branch = branch.nextSibling;
  }
  const following: ChildNode[] = [];
  let next = boundary.item.nextSibling;
  while (next) {
    following.push(next);
    next = next.nextSibling;
  }
  return { kind: 'lift', list, owner: parent, following, laterBranches };
};

export const canEditFirstBodyBackspace = (root: HTMLElement, boundary: ListItemBoundary): boolean => Boolean(firstBodyBackspacePlan(root, boundary));

const selectRange = (root: HTMLElement, range: Range): void => {
  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

/** Invoked only inside the cancelable-beforeinput transaction owner. */
export const editFirstBodyBackspace = (root: HTMLElement, boundary: ListItemBoundary, start: Range): boolean => {
  const plan = firstBodyBackspacePlan(root, boundary);
  if (!plan) return false;
  if (plan.kind === 'join') {
    // The outer transaction already captured the original first-body bookmark.
    // Reuse the validated forward join rather than duplicate body/branch rules.
    const original = activeRange(root)?.cloneRange();
    selectRange(root, plan.previous.ownEnd.cloneRange());
    if (editListForwardDelete(root)) return true;
    if (original) selectRange(root, original);
    return false;
  }

  // DOM Range coordinates can move to the old parent when an actual subtree is
  // transferred. Preserve the normalized inline node/offset explicitly.
  const container = start.startContainer;
  const offset = start.startOffset;
  if (plan.kind === 'unwrap') {
    for (const body of boundary.bodies)
      if (/^(p|h[1-6])$/.test(body.localName) && !body.hasAttribute('dir')) copyDirection(boundary.item, body);
    plan.list.before(...boundary.bodies, ...boundary.nestedLists);
    boundary.item.remove();
  } else {
    if (plan.following.some((node) => node instanceof HTMLLIElement)) {
      const trailing = plan.list.cloneNode(false) as HTMLElement;
      trailing.append(...plan.following);
      boundary.item.append(trailing);
    }
    // The remaining source siblings precede all later owner branches in the
    // original depth-first order. Keep whole branches separate in that order.
    boundary.item.append(...plan.laterBranches);
    plan.owner.after(boundary.item);
  }
  if (!plan.list.children.length) plan.list.remove();
  const caret = root.ownerDocument.createRange();
  caret.setStart(container, offset);
  caret.collapse(true);
  selectRange(root, caret);
  return true;
};
