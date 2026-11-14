import { activeRange } from '../selection/index.js';
import { finishSelectionReplacement } from '../input/index.js';
import { inspectListItem, listBodyAt, normalizeListBodyRange } from './selection-boundaries.js';

const isList = (node: Node): node is HTMLElement => node instanceof HTMLElement && (node.localName === 'ul' || node.localName === 'ol');

const selectedItem = (root: HTMLElement, range: Range): HTMLLIElement | undefined => {
  const element = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const item = element?.closest('li');
  return item instanceof HTMLLIElement && root.contains(item) && item.parentElement && isList(item.parentElement) ? item : undefined;
};

/** Find an own-body edge even when the item's shape will be a mutation barrier. */
const atOwnEnd = (item: HTMLLIElement, range: Range): boolean => {
  const body = item.ownerDocument.createRange();
  body.selectNodeContents(item);
  const children = [...item.childNodes];
  const branchIndex = children.findIndex(isList);
  const firstBranch = children[branchIndex];
  const ownNodes = branchIndex === -1 ? children : children.slice(0, branchIndex);
  if (firstBranch) body.setEndBefore(firstBranch);
  const end = body.cloneRange();
  end.collapse(false);
  if (range.compareBoundaryPoints(Range.START_TO_START, end) > 0) return false;
  const hasText = ownNodes.some((node) => (node.nodeType === 1 || node.nodeType === 3 || node.nodeType === 4) && Boolean(node.textContent));
  const blockers = 'img,hr,table,figure,pre,blockquote,ul,ol';
  const empty = !hasText
    && ownNodes.every((node) => !(node instanceof Element) || (!node.matches(blockers) && !node.querySelector(blockers)))
    && ownNodes.reduce((count, node) => count + (node instanceof Element ? Number(node.localName === 'br') + node.querySelectorAll('br').length : 0), 0) <= 1;
  if (empty) return true;
  body.setStart(range.startContainer, range.startOffset);
  const suffix = body.cloneContents();
  return !suffix.textContent && !suffix.querySelector('br,img,hr,table,figure,ul,ol');
};

const nextItem = (item: HTMLLIElement): HTMLLIElement | undefined => {
  let sibling = item.nextSibling;
  // Formatting whitespace between item elements is retained in the list.
  while (sibling?.nodeType === 3 && /^[\t\n\f\r ]*$/.test(sibling.textContent ?? '')) sibling = sibling.nextSibling;
  return sibling instanceof HTMLLIElement && sibling.parentElement === item.parentElement ? sibling : undefined;
};

const removeOwnPlaceholder = (nodes: readonly ChildNode[]): void => {
  for (const node of nodes) {
    if (node instanceof HTMLBRElement) node.remove();
    else if (node instanceof HTMLElement) {
      for (const placeholder of node.querySelectorAll('br')) placeholder.remove();
    }
  }
};

const atBodyEnd = (body: HTMLElement, point: Range): boolean => {
  const suffix = body.ownerDocument.createRange();
  suffix.selectNodeContents(body);
  suffix.setStart(point.startContainer, point.startOffset);
  const content = suffix.cloneContents();
  if (!body.textContent && body.querySelectorAll('br').length <= 1) return true;
  return !content.textContent && !content.querySelector('br,img');
};

const removeBodyPlaceholder = (body: HTMLElement): void => {
  if (!body.textContent && body.querySelectorAll('br').length <= 1) removeOwnPlaceholder([...body.childNodes]);
};

/** Only the validated cancelable beforeinput path calls this handler. */
export const handlesListForwardDelete = (root: HTMLElement, inputType: string): boolean => {
  if (inputType !== 'deleteContentForward') return false;
  const range = activeRange(root);
  if (!range?.collapsed) return false;
  const item = selectedItem(root, range);
  if (!item) return false;
  const boundary = inspectListItem(root, item);
  const previousEdge = range.startContainer === item && range.startOffset > 0;
  const body = boundary && listBodyAt(range, boundary, previousEdge);
  const point = boundary && normalizeListBodyRange(range, boundary, previousEdge);
  if (body && point) {
    if (body === item) return atOwnEnd(item, range);
    return atBodyEnd(body, point);
  }
  const element = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const wrapped = element?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
  if (wrapped?.parentElement === item && atBodyEnd(wrapped, range)) return true;
  return atOwnEnd(item, range);
};

/** Join one sibling pair inside the existing editor transaction; barriers are no-ops. */
export const editListForwardDelete = (root: HTMLElement): boolean => {
  const range = activeRange(root);
  if (!range?.collapsed) return false;
  const item = selectedItem(root, range);
  if (!item) return false;
  const left = inspectListItem(root, item);
  const previousEdge = range.startContainer === item && range.startOffset > 0;
  const current = left && listBodyAt(range, left, previousEdge);
  const point = left && normalizeListBodyRange(range, left, previousEdge);
  if (!left || !current || !point || !(current === item ? atOwnEnd(item, range) : atBodyEnd(current, point))) return false;
  const following = left.bodies[left.bodies.indexOf(current) + 1];
  if (following) {
    removeBodyPlaceholder(current);
    removeBodyPlaceholder(following);
    const join = root.ownerDocument.createRange();
    join.selectNodeContents(current);
    join.collapse(false);
    current.append(...following.childNodes);
    following.remove();
    finishSelectionReplacement(current, join);
    return true;
  }
  const rightItem = nextItem(item);
  const right = rightItem && inspectListItem(root, rightItem);
  if (!right) return false;

  // Branches stay independent: no list scan/coalescing, attribute rewrite or
  // descendant normalization is needed to join the items' own inline bodies.
  for (const branch of left.nestedLists) branch.remove();
  for (const branch of right.nestedLists) branch.remove();
  let target = current;
  const rightBody = right.bodies[0];
  const laterBodies = right.bodies.slice(1);
  if (target === item && laterBodies.length) {
    // A direct-inline item cannot also own block siblings. Promote only when
    // preserving later right bodies requires that representation.
    target = root.ownerDocument.createElement('p');
    target.append(...left.ownNodes);
    item.append(target);
  }
  removeBodyPlaceholder(target);
  removeBodyPlaceholder(rightBody);
  const join = root.ownerDocument.createRange();
  join.selectNodeContents(target);
  join.collapse(false);
  const rightNodes = rightBody === right.item ? right.ownNodes : [...rightBody.childNodes];
  target.append(...rightNodes.filter((node) => node.parentNode === rightBody));
  finishSelectionReplacement(target, join);
  item.append(...laterBodies, ...left.nestedLists, ...right.nestedLists);
  right.item.remove();
  return true;
};
