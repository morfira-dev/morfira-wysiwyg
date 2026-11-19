import type { DocumentNode, Editor, EditorDocument, ElementNode } from '@morfira-dev/wysiwyg-core';
import { clipboardBlockPayload, editClipboardSelection } from './clipboard-edit.js';
import { clipboardListNode, clipboardListPayload } from './clipboard-list-data.js';
import { atomicFlow, setAtomicSelection } from './selection.js';
import type { AtomicClipboardSnapshot } from './types.js';

const singleBreak = (node: ParentNode): boolean => node.childNodes.length === 1
  && node.firstChild?.nodeType === 1 && (node.firstChild as Element).localName === 'br';
const placeholder = (body: HTMLElement): void => {
  if (!body.textContent && !body.querySelector('br')) body.append(body.ownerDocument.createElement('br'));
};
const promote = (item: HTMLLIElement, caret: Range): HTMLElement => {
  const document = item.ownerDocument;
  const body = document.createElement('p');
  const point = { node: caret.startContainer, offset: caret.startOffset };
  while (item.firstChild) body.append(item.firstChild);
  item.append(body);
  caret.setStart(point.node === item ? body : point.node, point.offset);
  caret.collapse(true);
  return body;
};
const firstValue = (item: ElementNode): EditorDocument => {
  let children = item.children.filter((node) => !clipboardListNode(node));
  if (children.length === 1 && children[0].type === 'element' && children[0].tag === 'p') children = children[0].children;
  const hasText = (nodes: readonly DocumentNode[]): boolean => nodes.some((node) => node.type === 'text' ? !!node.text : hasText(node.children));
  const breaks = (nodes: readonly DocumentNode[]): number => nodes.reduce((total, node) => total + (node.type === 'element' ? Number(node.tag === 'br') + breaks(node.children) : 0), 0);
  if (!children.some((node) => node.type === 'element' && /^(p|h[1-6])$/.test(node.tag)) && !hasText(children) && breaks(children) === 1) {
    const strip = (node: DocumentNode): DocumentNode[] => node.type === 'element'
      ? node.tag === 'br' ? [] : [{ ...node, children: node.children.flatMap(strip) }] : [node];
    children = children.flatMap(strip);
  }
  return { version: 1, children };
};

/** Same-list source clipping never clones or serializes the unselected final branches. */
export const editListClipboardSelection = (editor: Editor, plan: AtomicClipboardSnapshot, value?: EditorDocument): boolean => {
  const selected = plan.list;
  if (!selected) return false;
  const document = editor.surface.ownerDocument;
  const first = selected.items[0];
  const last = selected.items.at(-1)!;
  const payload = clipboardListPayload(value);
  const firstPayload = payload ? firstValue(payload.children[0] as ElementNode) : value;
  const blockPayload = clipboardBlockPayload(firstPayload);
  // Inert parsing validated every incoming item before any live source edits.
  const fragment = payload ? editor.schema.renderDocument(value!) : undefined;
  const incoming = fragment ? [...fragment.firstElementChild!.children] as HTMLLIElement[] : [];
  const branchesOf = (item: HTMLLIElement | undefined): HTMLElement[] => item ? [...item.children].filter((node) => ['ul', 'ol'].includes(node.localName)) as HTMLElement[] : [];
  const firstIncomingBranches = branchesOf(incoming[0]);
  for (const branch of firstIncomingBranches) branch.remove();
  const finalIncomingBranches = incoming.length > 1 ? branchesOf(incoming.at(-1)) : [];
  for (const branch of finalIncomingBranches) branch.remove();
  const caret = plan.range.cloneRange();
  caret.collapse(true);
  const followingBodies = last.bodies.slice(last.bodies.indexOf(selected.lastBody) + 1);
  const following: HTMLElement[] = [...followingBodies, ...last.branches];
  for (const node of following) node.remove();
  const firstBranches = new Set<Node>(first.branches);
  const firstOwn = first.direct ? [...first.item.childNodes].filter((node) => !firstBranches.has(node)) : [...selected.firstBody.childNodes];
  const firstPlaceholder = firstOwn.length === 1 && firstOwn[0].nodeType === 1 && (firstOwn[0] as Element).localName === 'br';
  const lastPlaceholder = singleBreak(selected.lastBody);
  const suffixRange = document.createRange();
  suffixRange.selectNodeContents(selected.lastBody);
  suffixRange.setStart(plan.range.endContainer, plan.range.endOffset);
  const suffix = suffixRange.extractContents();
  if (lastPlaceholder && singleBreak(suffix)) suffix.replaceChildren();
  const cut = document.createRange();
  cut.selectNodeContents(selected.firstBody);
  cut.setStart(plan.range.startContainer, plan.range.startOffset);
  cut.deleteContents();
  if (firstPlaceholder && singleBreak(selected.firstBody)) {
    selected.firstBody.replaceChildren();
    caret.selectNodeContents(selected.firstBody);
    caret.collapse(true);
  }
  const start = first.bodies.indexOf(selected.firstBody);
  const end = last.bodies.indexOf(selected.lastBody);
  const coveredFirst = first.item === last.item ? first.bodies.slice(start + 1, end + 1) : first.bodies.slice(start + 1);
  // Covered formatting gaps belong to the cut too; preserve gaps outside a
  // same-item selection rather than stripping whitespace from the whole item.
  if (!first.direct && (first.item !== last.item || coveredFirst.length)) {
    const stop = first.item === last.item ? coveredFirst.at(-1)!.nextSibling : null;
    let node = selected.firstBody.nextSibling;
    while (node && node !== stop) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
  }
  if (first.item !== last.item) {
    const remove: ChildNode[] = [];
    for (let node = first.item.nextSibling; node; node = node.nextSibling) {
      remove.push(node);
      if (node === last.item) break;
    }
    for (const node of remove) node.remove();
  }
  let body = selected.firstBody;
  // Actual suffix is joined before the existing body composer splits it again.
  body.append(suffix);
  if (first.direct && (blockPayload || following.some((node) => /^(p|h[1-6])$/.test(node.localName)))) body = promote(first.item, caret);
  const current: AtomicClipboardSnapshot = { ...plan, flow: body, leaves: [body], parent: body.parentElement, range: caret.cloneRange(), list: undefined };
  let inserted = false;
  if (firstPayload?.children.length) inserted = editClipboardSelection(editor, current, firstPayload);
  else {
    placeholder(body);
    const native = document.getSelection();
    if (native) setAtomicSelection(native, caret);
  }
  if (firstPayload && firstPayload.children.length && !inserted) throw new TypeError('Unsupported list body clipboard composition.');
  const native = document.getSelection();
  const position = native?.rangeCount === 1 ? native.getRangeAt(0).cloneRange() : caret;
  if (incoming.length > 1) {
    const outgoingBody = atomicFlow(editor.surface, position.startContainer)!;
    const outgoingPlaceholder = singleBreak(outgoingBody);
    const tailRange = document.createRange();
    tailRange.selectNodeContents(outgoingBody);
    tailRange.setStart(position.startContainer, position.startOffset);
    const tail = tailRange.extractContents();
    if (outgoingPlaceholder && singleBreak(tail)) tail.replaceChildren();
    // A standalone incoming heading creates a temporary suffix body, which now
    // belongs to the last incoming item instead of an empty first-item sibling.
    const heading = firstPayload?.children.length === 1 && firstPayload.children[0].type === 'element'
      && /^h[1-6]$/.test(firstPayload.children[0].tag);
    if (heading && outgoingBody !== body) outgoingBody.remove();
    else placeholder(outgoingBody);
    for (const branch of firstIncomingBranches) first.item.append(branch);
    let anchor: HTMLElement = first.item;
    for (const item of incoming.slice(1)) { anchor.after(item); anchor = item; }
    const finalItem = incoming.at(-1)!;
    let finalBody = finalItem.lastElementChild && /^(p|h[1-6])$/.test(finalItem.lastElementChild.localName)
      ? finalItem.lastElementChild as HTMLElement : finalItem;
    const finalCaret = document.createRange();
    finalCaret.selectNodeContents(finalBody);
    if (singleBreak(finalBody)) finalBody.replaceChildren();
    finalCaret.collapse(false);
    if (finalBody === finalItem && following.some((node) => /^(p|h[1-6])$/.test(node.localName))) finalBody = promote(finalItem, finalCaret);
    finalCaret.selectNodeContents(finalBody);
    finalCaret.collapse(false);
    finalBody.append(tail);
    placeholder(finalBody);
    for (const node of followingBodies) finalItem.append(node);
    for (const branch of finalIncomingBranches) finalItem.append(branch);
    for (const branch of last.branches) finalItem.append(branch);
    for (const item of incoming.slice(1)) {
      const bodies = [...item.children].filter((node) => /^(p|h[1-6])$/.test(node.localName));
      if (bodies.length) for (const leaf of bodies) placeholder(leaf as HTMLElement);
      else if (item !== finalItem) placeholder(item);
    }
    if (native) setAtomicSelection(native, finalCaret);
    finalBody.normalize();
  }
  else {
    for (const node of followingBodies) first.item.append(node);
    for (const branch of firstIncomingBranches) first.item.append(branch);
    for (const branch of last.branches) first.item.append(branch);
    if (native) setAtomicSelection(native, position);
  }
  body.normalize();
  return true;
};
