import type { DocumentNode, ElementNode } from '@morfira-dev/wysiwyg-core';
import { normalizeClipboardList } from './clipboard-list-data.js';
import { validAtomicMention } from './selection.js';
import type { AtomicClipboardTreeBudget } from './types.js';

const tags = new Set(['ul', 'ol', 'li', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
/** Typed reconstruction never clones active DOM and refuses resources before descending. */
export const readClipboardBranch = (root: HTMLElement, branch: HTMLElement, budget: AtomicClipboardTreeBudget): ElementNode => {
  const beforeCount = budget.count;
  const read = (node: Node, depth: number): DocumentNode => {
    if (++budget.count > 100_000 || depth > 100) throw new RangeError('Mention list tree exceeds document limits.');
    if (node.nodeType === 3) {
      const text = node.textContent ?? '';
      budget.length += text.length;
      if (budget.length > 5_000_000) throw new RangeError('Mention list tree exceeds document limits.');
      return { type: 'text', text };
    }
    if (node.nodeType !== 1) throw new TypeError('Unsupported mention list tree node.');
    const element = node as Element;
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !tags.has(element.localName)
      || element.hasAttribute('data-checklist-checked')
      || (element.hasAttribute('data-mw-node') && !validAtomicMention(root, element)))
      throw new TypeError('Unsupported mention list tree content.');
    budget.length += element.localName.length * 2 + 5;
    for (const attribute of element.attributes) budget.length += attribute.name.length + attribute.value.length + 4;
    if (budget.length > 5_000_000) throw new RangeError('Mention list tree exceeds document limits.');
    return { type: 'element', tag: element.localName as ElementNode['tag'],
      attributes: Object.fromEntries([...element.attributes].map(({ name, value }) => [name, value])),
      children: [...element.childNodes].map((child) => read(child, depth + 1)) };
  };
  const value = read(branch, 0) as ElementNode;
  if (!normalizeClipboardList({ version: 1, children: [value] })) throw new TypeError('Unsupported mention list tree structure.');
  const count = (node: DocumentNode): number => 1 + (node.type === 'element' ? node.children.reduce((total, child) => total + count(child), 0) : 0);
  // Normalization can add editable placeholders; charge them to the shared
  // selection budget as well, rather than resetting limits for every branch.
  budget.count = beforeCount + count(value);
  if (budget.count > 100_000) throw new RangeError('Mention list tree exceeds document limits.');
  return value;
};
