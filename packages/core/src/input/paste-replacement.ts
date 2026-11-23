import { ordinaryLeafTags as leafTags } from './leaf-tags.js';
import { selectionReplacement, cutSelectionReplacement, ensureReplacementPlaceholder, finishSelectionReplacement } from './replace-selection.js';
import { insertInlineFragment } from './inline-fragment.js';
import { ensureBodyPlaceholder, insertReplacementBlocks } from './replacement-blocks.js';

const inlineTags = new Set(['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'code', 'br', 'img']);

const blockTags = new Set([...leafTags, 'blockquote', 'pre', 'hr', 'ul', 'ol', 'table', 'figure']);
const inlineNode = (node: Node): boolean => node.nodeType === 3 || (node instanceof HTMLElement && inlineTags.has(node.localName));
const ordinaryPayloadLeaf = (node: Node): node is HTMLElement => node instanceof HTMLElement && leafTags.has(node.localName) && !node.hasAttribute('data-mw-node') && [...node.childNodes].every(inlineNode);
/** Validate/normalize a detached payload only when the new sibling-range path owns it. */
export const prepareSelectionPaste = (root: HTMLElement, fragment: DocumentFragment, range?: Range): void => {
  const selected = selectionReplacement(root, range);
  if (!selected) return;
  if (fragment.querySelector('table table') || (selected.leaves[0].closest('td,th') && fragment.querySelector('table')))
    throw new TypeError('Nested table insertion is unsupported for this selection.');
  for (const node of fragment.childNodes) {
    if (!inlineNode(node) && (!(node instanceof HTMLElement) || !blockTags.has(node.localName)))
      throw new TypeError('Unsupported root structure for sibling selection insertion.');
  }
  for (const element of fragment.querySelectorAll('*')) {
    if ((inlineTags.has(element.localName) || leafTags.has(element.localName)) && ![...element.childNodes].every(inlineNode))
      throw new TypeError('A phrasing wrapper cannot contain pasted blocks.');
  }
  const hasBlocks = [...fragment.childNodes].some((node) => !inlineNode(node));
  if (hasBlocks) {
    for (const node of [...fragment.childNodes]) {
      if (node.nodeType === 3 && /^[\t\n\f\r ]*$/.test(node.textContent ?? '')) node.remove();
    }
  }
};

const meaningfulTail = (tail: DocumentFragment): boolean => Boolean(tail.textContent) || [...tail.querySelectorAll('*')].some((node) => node.attributes.length || ['br', 'img'].includes(node.localName));

/** A validated fragment replaces only the accepted ordinary sibling range. */
export const replaceSelectionWithFragment = (root: HTMLElement, fragment: DocumentFragment): boolean => {
  const selected = selectionReplacement(root);
  if (!selected) return false;
  // Trusted focus listeners may have changed the context since detached preflight.
  prepareSelectionPaste(root, fragment, selected.range);
  const nodes = [...fragment.childNodes];
  const singleParagraph = nodes.length === 1 && ordinaryPayloadLeaf(nodes[0]) && nodes[0].localName === 'p';
  const inline = nodes.every(inlineNode) || singleParagraph;
  const leaves = nodes.length > 1 && nodes.every(ordinaryPayloadLeaf);
  const cut = cutSelectionReplacement(selected);
  const { left, right, tail, caret } = cut;
  if (inline) {
    if (singleParagraph) fragment.replaceChildren(...nodes[0].childNodes);
    insertInlineFragment(left, caret, fragment);
    left.append(tail);
    finishSelectionReplacement(left, caret);
    return true;
  }
  if (leaves) {
    insertReplacementBlocks(cut, nodes as HTMLElement[]);
    return true;
  }
  // Mixed root inline runs become proper sibling paragraphs, never children of a mark.
  let paragraph: HTMLParagraphElement | undefined;
  for (const node of [...fragment.childNodes]) {
    if (inlineNode(node)) {
      if (!paragraph) {
        paragraph = root.ownerDocument.createElement('p');
        fragment.insertBefore(paragraph, node);
      }
      paragraph.append(node);
    }
    else paragraph = undefined;
  }
  const last = fragment.lastChild!;
  const inserted = [...fragment.childNodes];
  left.after(fragment);
  ensureReplacementPlaceholder(left, caret);
  left.normalize();
  for (const node of inserted) {
    if (node instanceof HTMLElement && leafTags.has(node.localName)) ensureBodyPlaceholder(node);
  }
  const suffix = meaningfulTail(tail) ? right : root.ownerDocument.createElement('p');
  suffix.replaceChildren(tail);
  last.after(suffix);
  finishSelectionReplacement(suffix, ensureBodyPlaceholder(suffix));
  return true;
};
