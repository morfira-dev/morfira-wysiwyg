import { activeRange, placeCaret, preserveRange } from '../selection/index.js';
const blocks = 'p,h1,h2,h3,h4,h5,h6,blockquote,pre,li';
const isList = (element: Element | null): element is HTMLUListElement | HTMLOListElement => !!element && /^(ul|ol)$/.test(element.localName);
const elementAt = (node: Node): Element | null => node instanceof Element ? node : node.parentElement;
const blockAt = (root: HTMLElement, node: Node, preferItem = true): HTMLElement | undefined => {
  const element = elementAt(node);
  const item = element?.closest<HTMLElement>('li');
  const block = (preferItem && item && root.contains(item) ? item : undefined) ?? element?.closest<HTMLElement>(blocks);
  return block && root.contains(block) ? block : undefined;
};
const touches = (range: Range, node: Node): boolean => {
  const content = node.ownerDocument!.createRange();
  if (node.nodeType === 3)
    content.selectNodeContents(node);
  else
    content.selectNode(node);
  const start = range.cloneRange();
  start.collapse(true);
  const end = range.cloneRange();
  end.collapse(false);
  const first = content.cloneRange();
  first.collapse(true);
  const last = content.cloneRange();
  last.collapse(false);
  return start.compareBoundaryPoints(Range.START_TO_START, last) < 0 && end.compareBoundaryPoints(Range.START_TO_START, first) > 0;
};
export const selectedBlocks = (root: HTMLElement, range = activeRange(root), preferItems = true): HTMLElement[] => {
  if (!range)
    return [];
  if (range.collapsed) {
    const block = blockAt(root, range.startContainer, preferItems);
    return block ? [block] : [];
  }
  const found = new Set<HTMLElement>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!(node.nodeType === 3 && node.textContent) && !(node instanceof Element && /^(br|img|hr)$/.test(node.localName)))
      continue;
    if (touches(range, node)) {
      const block = blockAt(root, node, preferItems);
      if (block)
        found.add(block);
    }
  }
  return [...root.querySelectorAll<HTMLElement>(blocks)].filter((block) => found.has(block));
};
const topItems = (items: HTMLElement[]) => items.filter((item) => !items.some((parent) => parent !== item && parent.contains(item)));
const itemRange = (root: HTMLElement): HTMLLIElement[] => {
  const items = topItems(selectedBlocks(root));
  if (!items.length || items.some((item) => item.localName !== 'li' || !isList(item.parentElement)))
    return [];
  const parent = items[0].parentElement;
  if (items.some((item) => item.parentElement !== parent))
    return [];
  const siblings = [...parent!.children];
  if (siblings.indexOf(items.at(-1)!) - siblings.indexOf(items[0]) + 1 !== items.length)
    return [];
  return items as HTMLLIElement[];
};
const depth = (root: HTMLElement, item: HTMLElement): number => {
  let result = 0; let parent: Element | null = item.parentElement; while (parent && parent !== root) {
    if (isList(parent))
      result++;
    parent = parent.parentElement;
  } return result;
};
const compatible = (a: Element | null, b: Element): a is HTMLElement => !!a && a.localName === b.localName && isList(a) && a.getAttribute('style') === b.getAttribute('style');
const joinLists = (root: HTMLElement): void => {
  for (const list of [...root.querySelectorAll<HTMLElement>('ul,ol')]) {
    if (!root.contains(list))
      continue;
    const previous = list.previousSibling;
    if (previous instanceof Element && compatible(previous, list)) {
      previous.append(...list.childNodes);
      list.remove();
    }
  }
};
const splitAround = (item: HTMLLIElement, replacement: Node[]): void => {
  const list = item.parentElement!;
  const tail = list.cloneNode(false) as HTMLElement;
  while (item.nextSibling)
    tail.append(item.nextSibling);
  item.remove();
  list.after(...replacement, ...(tail.childNodes.length ? [tail] : []));
  if (!list.childNodes.length)
    list.remove();
};
const ownContent = (item: HTMLElement) => [...item.childNodes].filter((node) => !(node instanceof Element && isList(node)));
const unwrapRoot = (item: HTMLLIElement, paragraphOnly = false): void => {
  const paragraphNode = () => {
    const node = document.createElement('p'); if (item.hasAttribute('style'))
      node.setAttribute('style', item.getAttribute('style')!); return node;
  };
  let paragraph = paragraphNode();
  const nested = [...item.children].filter(isList);
  const content = ownContent(item);
  // Imported items may contain paragraphs; retain their block structure rather than nest p in p.
  const output: Node[] = [];
  for (const node of content) {
    if (paragraphOnly && node instanceof HTMLElement && /^(p|h[1-6]|blockquote|pre)$/.test(node.localName)) {
      paragraph.append(...node.childNodes);
    }
    else if (node instanceof HTMLElement && /^(p|h[1-6]|blockquote|pre)$/.test(node.localName)) {
      if (paragraph.childNodes.length)
        output.push(paragraph);
      paragraph = paragraphNode();
      output.push(node);
    }
    else
      paragraph.append(node);
  }
  if (paragraph.childNodes.length || !output.length) {
    if (!paragraph.childNodes.length)
      paragraph.append(document.createElement('br'));
    output.push(paragraph);
  }
  splitAround(item, [...output, ...nested]);
};
const lift = (items: HTMLLIElement[]): void => {
  const list = items[0].parentElement!;
  const owner = list.parentElement;
  if (owner?.localName !== 'li' || !isList(owner.parentElement)) {
    for (const item of items)
      unwrapRoot(item);
    return;
  }
  const trailing = list.cloneNode(false) as HTMLElement;
  while (items.at(-1)!.nextSibling)
    trailing.append(items.at(-1)!.nextSibling!);
  if (trailing.childNodes.length)
    items.at(-1)!.append(trailing);
  owner.after(...items);
  if (!list.childNodes.length)
    list.remove();
};
export const listState = (root: HTMLElement) => {
  const items = itemRange(root);
  const canIndent = !!items.length && items[0].previousElementSibling?.localName === 'li' && items.every((item) => [item, ...item.querySelectorAll<HTMLElement>('li')].every((child) => depth(root, child) < 8));
  return { listDepth: items.length ? depth(root, items[0]) : 0, canIndent, canOutdent: !!items.length };
};
export const indentList = (root: HTMLElement, direction: unknown): void => {
  if (direction !== 1 && direction !== -1)
    throw new TypeError('List indentation requires 1 or -1.');
  const items = itemRange(root);
  if (!items.length)
    throw new RangeError('Select consecutive items in the same list.');
  if (direction === 1 && !listState(root).canIndent)
    return;
  preserveRange(root, () => {
    if (direction === -1)
      lift(items);
    else {
      const list = items[0].parentElement!;
      const previous = items[0].previousElementSibling!;
      let nested = previous.lastElementChild;
      if (!compatible(nested, list)) {
        nested = list.cloneNode(false) as HTMLElement;
        previous.append(nested);
      }
      nested!.append(...items);
    }
    joinLists(root);
  });
};
export const applyList = (root: HTMLElement, value: unknown): void => {
  if (value !== false && value !== 'bullet' && value !== 'ordered')
    throw new TypeError('Expected bullet, ordered or false.');
  const selected = topItems(selectedBlocks(root));
  if (selected.some((block) => block.localName === 'li' && !isList(block.parentElement)))
    throw new RangeError('A list item must belong to a list.');
  preserveRange(root, () => {
    for (const block of selected) {
      if (!value) {
        if (block.localName === 'li')
          lift([block as HTMLLIElement]);
        continue;
      }
      const tag = value === 'bullet' ? 'ul' : 'ol';
      if (block.localName === 'li') {
        if (block.parentElement!.localName === tag)
          continue;
        const list = document.createElement(tag);
        if (block.parentElement!.hasAttribute('style'))
          list.setAttribute('style', block.parentElement!.getAttribute('style')!);
        splitAround(block as HTMLLIElement, [list]);
        list.append(block);
      }
      else {
        const list = document.createElement(tag);
        const item = document.createElement('li');
        if (block.hasAttribute('style'))
          item.setAttribute('style', block.getAttribute('style')!);
        item.append(...block.childNodes);
        list.append(item);
        block.replaceWith(list);
      }
    }
    joinLists(root);
  });
};
const empty = (item: HTMLElement) => !item.textContent?.trim() && !item.querySelector('img,hr,ul,ol');
const placeholder = (item: HTMLElement): void => {
  const own = ownContent(item);
  const meaningful = own.some((node) => node.textContent || (node instanceof Element && (node.matches('br,img,hr') || node.querySelector('br,img,hr'))));
  if (!meaningful) {
    if ([...item.children].some(isList))
      item.prepend(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
    else
      item.append(document.createElement('br'));
  }
};
const atStart = (item: HTMLElement, range: Range) => {
  const prefix = range.cloneRange();
  prefix.selectNodeContents(item);
  prefix.setEnd(range.startContainer, range.startOffset);
  return !prefix.toString() && !prefix.cloneContents().querySelector('img,hr,br');
};
export const handlesListInput = (root: HTMLElement, inputType: string): boolean => {
  const range = activeRange(root);
  if (!range)
    return false;
  const item = blockAt(root, range.startContainer);
  if (item?.localName !== 'li' || !isList(item.parentElement) || blockAt(root, range.endContainer) !== item)
    return false;
  return ['insertParagraph', 'insertLineBreak'].includes(inputType) || (inputType === 'deleteContentBackward' && range.collapsed && atStart(item, range));
};
export const editListInput = (root: HTMLElement, inputType: string): void => {
  const range = activeRange(root)!;
  const item = blockAt(root, range.startContainer) as HTMLLIElement;
  if (inputType === 'insertParagraph') {
    if (empty(item)) {
      preserveRange(root, () => {
        const owner = item.parentElement!.parentElement; if (owner?.localName === 'li' && isList(owner.parentElement))
          lift([item]);
        else
          unwrapRoot(item, true);
      });
      joinLists(root);
      return;
    }
    range.deleteContents();
    const tail = range.cloneRange();
    tail.selectNodeContents(item);
    tail.setStart(range.startContainer, range.startOffset);
    const next = item.cloneNode(false) as HTMLLIElement;
    next.append(tail.extractContents());
    item.after(next);
    placeholder(item);
    placeholder(next);
    const walker = document.createTreeWalker(next, NodeFilter.SHOW_TEXT);
    let first: Node | null;
    do {
      first = walker.nextNode();
    } while (first && (!first.textContent || first.parentElement?.closest('li') !== next));
    if (first) {
      const caret = document.createRange();
      caret.setStart(first, 0);
      caret.collapse(true);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(caret);
    }
    else
      placeCaret(next.querySelector<HTMLElement>('p,h1,h2,h3,h4,h5,h6,pre') ?? next);
  }
  else if (inputType === 'insertLineBreak') {
    range.deleteContents();
    const br = document.createElement('br');
    range.insertNode(br);
    if (!br.nextSibling)
      br.after(document.createElement('br'));
    range.setStartAfter(br);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  else {
    const previous = item.previousElementSibling as HTMLLIElement | null;
    if (previous && previous.localName !== 'li')
      return;
    if (!previous) {
      preserveRange(root, () => lift([item]));
      joinLists(root);
      return;
    }
    if (!ownContent(previous).some((node) => node.textContent || (node instanceof Element && (node.localName === 'img' || node.querySelector('img'))))) {
      for (const br of [...previous.querySelectorAll('br')])
        if (br.closest('li') === previous)
          br.remove();
    }
    const marker = document.createComment('mw-join');
    const previousContent = ownContent(previous);
    const last = previousContent.at(-1);
    const target = last instanceof HTMLElement && /^(p|h[1-6]|blockquote|pre)$/.test(last.localName) ? last : previous;
    if (target === previous)
      previous.insertBefore(marker, [...previous.children].find(isList) ?? null);
    else
      target.append(marker);
    const content = ownContent(item);
    if (content[0] instanceof HTMLElement && /^(p|h[1-6])$/.test(content[0].localName))
      content.splice(0, 1, ...content[0].childNodes);
    marker.after(...content);
    for (const nested of [...item.children].filter(isList))
      previous.append(nested);
    item.remove();
    joinLists(root);
    const caret = document.createRange();
    caret.setStartBefore(marker);
    caret.collapse(true);
    marker.remove();
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
  }
};
