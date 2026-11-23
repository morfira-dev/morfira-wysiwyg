import { ordinaryLeafTags as leafTags, ordinaryLeafSelector } from './leaf-tags.js';
import { inlineSourceChildren } from './inline-source.js';
import type { SelectionReplacement } from './internal-types.js';



const ordinaryLeaf = (node: Node): node is HTMLElement => node instanceof HTMLElement
  && leafTags.has(node.localName)
  && !node.hasAttribute('data-mw-node')
  && !node.matches('[contenteditable="false"]')
  && !node.querySelector('[contenteditable="false"]')
  && inlineSourceChildren(node);

const rootChild = (root: HTMLElement, leaf: HTMLElement): HTMLElement | undefined => {
  if (leaf.parentElement === root) return leaf;
  const quote = leaf.parentElement;
  if (quote?.localName === 'blockquote' && quote.parentElement === root) return quote;
  return;
};

/** Native-only bounded interval. Paste retains the ordinary sibling classifier. */
export const quoteSelectionReplacement = (root: HTMLElement, range: Range): SelectionReplacement | undefined => {
  const first = (range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement)?.closest(ordinaryLeafSelector);
  const last = (range.endContainer.nodeType === 1 ? range.endContainer as Element : range.endContainer.parentElement)?.closest(ordinaryLeafSelector);
  if (!first || !last || !ordinaryLeaf(first) || !ordinaryLeaf(last) || first === last) return;
  const start = rootChild(root, first);
  const end = rootChild(root, last);
  if (!start || !end || start === end) return;

  const allLeaves: HTMLElement[] = [];
  const quotes: HTMLElement[] = [];
  let child: ChildNode | null = start;
  while (child) {
    if (ordinaryLeaf(child)) allLeaves.push(child);
    else if (child instanceof HTMLElement && child.localName === 'blockquote'
      && !child.hasAttribute('data-mw-node') && !child.matches('[contenteditable="false"]')
      && child.childNodes.length && [...child.childNodes].every(ordinaryLeaf)) {
      for (const leaf of child.childNodes) {
        if (ordinaryLeaf(leaf)) allLeaves.push(leaf);
      }
      quotes.push(child);
    }
    else return;
    if (child === end) {
      const firstIndex = allLeaves.indexOf(first);
      const lastIndex = allLeaves.indexOf(last);
      if (firstIndex < 0 || lastIndex <= firstIndex) return;
      return { range, leaves: allLeaves.slice(firstIndex, lastIndex + 1), emptyContainers: quotes };
    }
    child = child.nextSibling;
  }
  return;
};
