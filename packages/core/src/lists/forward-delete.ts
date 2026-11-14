import { activeRange } from '../selection/index.js';
import { finishSelectionReplacement } from '../input/index.js';
import { inspectListItem } from './selection-boundaries.js';

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

/** Only the validated cancelable beforeinput path calls this handler. */
export const handlesListForwardDelete = (root: HTMLElement, inputType: string): boolean => {
  if (inputType !== 'deleteContentForward') return false;
  const range = activeRange(root);
  if (!range?.collapsed) return false;
  const item = selectedItem(root, range);
  return Boolean(item && atOwnEnd(item, range));
};

/** Join one sibling pair inside the existing editor transaction; barriers are no-ops. */
export const editListForwardDelete = (root: HTMLElement): boolean => {
  const range = activeRange(root);
  if (!range?.collapsed) return false;
  const item = selectedItem(root, range);
  if (!item || !atOwnEnd(item, range)) return false;
  const rightItem = nextItem(item);
  const left = inspectListItem(root, item);
  const right = rightItem && inspectListItem(root, rightItem);
  if (!left || !right) return false;

  // Branches stay independent: no list scan/coalescing, attribute rewrite or
  // descendant normalization is needed to join the items' own inline bodies.
  for (const branch of left.nestedLists) branch.remove();
  if (left.ownEmpty) removeOwnPlaceholder(left.ownNodes);
  if (right.ownEmpty) removeOwnPlaceholder(right.ownNodes);
  const join = root.ownerDocument.createRange();
  join.selectNodeContents(left.body);
  join.collapse(false);
  left.body.append(...right.ownNodes.filter((node) => node.parentNode === right.body));
  finishSelectionReplacement(left.body, join);
  item.append(...left.nestedLists, ...right.nestedLists);
  right.item.remove();
  return true;
};
