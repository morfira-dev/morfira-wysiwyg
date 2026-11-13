import { documentHTML, parseHTML } from '../document/index.js';
import { normalizeLink, mergeLinkAttributes, transformInlineAttributes } from './inline-attributes.js';
import { activeRange, readTextSelection, selectText, preserveRange } from '../selection/index.js';
export const applyLink = (root: HTMLElement, value: unknown): void => {
  const link = normalizeLink(value);
  const range = activeRange(root);
  if (!range)
    return;
  const selection = readTextSelection(root)!;
  const element = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
  const anchor = element?.closest('a');
  const existing = anchor && root.contains(anchor) ? anchor : undefined;
  if (link && link.text !== undefined && (!range.collapsed || existing))
    throw new TypeError('Link text is only supported for insertion at a caret outside links.');
  if (!range.collapsed) {
    root.innerHTML = documentHTML(transformInlineAttributes(parseHTML(root.innerHTML), selection.index, selection.index + selection.length, { kind: 'link', attributes: link && link.attributes }));
    selectText(root, selection.index, selection.length);
    return;
  }
  if (existing) {
    const attrs = link && mergeLinkAttributes(Object.fromEntries([...existing.attributes].map((attr) => [attr.name, attr.value])), link.attributes);
    preserveRange(root, () => {
      if (!attrs)
        existing.replaceWith(...existing.childNodes);
      else {
        for (const attr of [...existing.attributes])
          existing.removeAttribute(attr.name);
        for (const [key, val] of Object.entries(attrs))
          existing.setAttribute(key, val);
      }
    });
    return;
  }
  if (!link || link.text === undefined)
    return;
  const created = root.ownerDocument.createElement('a');
  for (const [key, val] of Object.entries(link.attributes))
    created.setAttribute(key, val);
  created.textContent = link.text;
  const parent = element?.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,td,th');
  if (parent?.childNodes.length === 1 && parent.firstChild instanceof HTMLBRElement) {
    parent.firstChild.remove();
    range.setStart(parent, 0);
  }
  range.insertNode(created);
  const tail = root.ownerDocument.createTextNode('');
  created.after(tail);
  range.setStart(tail, 0);
  range.collapse(true);
  const native = root.ownerDocument.getSelection();
  native?.removeAllRanges();
  native?.addRange(range);
};
