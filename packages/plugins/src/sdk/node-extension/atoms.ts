import type { AtomicContext } from '../internal-types.js';
import { adjacentAtom, applyRange, atomAncestor, atomFlow, expandAtoms, nativeRange, ordinaryAtomRange, sameRange, touchedAtoms } from './atom-range.js';

/** Inline-only atom behavior. Structural or foreign owners keep their own policy. */
export const setupAtoms = (context: AtomicContext): (() => void) => {
  const { editor, owns } = context;
  const root = editor.surface;
  const document = root.ownerDocument;
  const owned = new Map<HTMLElement, string | null>();
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let composing = false;
  let changing = false;
  let revision = 0;
  const active = () => !disposed && !composing && !editor.isReadOnly();
  const focused = () => document.activeElement === root || root.contains(document.activeElement);
  const release = (node: HTMLElement) => {
    const previous = owned.get(node);
    owned.delete(node);
    if (node.getAttribute('contenteditable') !== 'false') return;
    if (previous === null) {
      if (!editor.positions.setPresentation(node, undefined) && (disposed || !root.contains(node))) node.removeAttribute('contenteditable');
    }
    else if (previous !== undefined && previous !== 'false') node.setAttribute('contenteditable', previous);
  };
  const consider = (node: Element) => {
    const element = node as HTMLElement;
    if (!owns(node)) { release(element); return; }
    const previous = element.getAttribute('contenteditable');
    if (previous === 'false') {
      if (!owned.has(element)) owned.set(element, previous);
      return;
    }
    if (editor.positions.setPresentation(element, false) && !owned.has(element)) owned.set(element, previous);
  };
  const scan = (node: Node) => {
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.hasAttribute('data-mw-node')) consider(element);
    for (const candidate of element.querySelectorAll('[data-mw-node]')) consider(candidate);
  };
  const process = (records: readonly MutationRecord[]) => {
    if (disposed) return;
    for (const record of records) {
      if (record.type === 'childList') {
        for (const removed of record.removedNodes) {
          if (root.contains(removed)) continue;
          for (const node of [...owned.keys()]) if (removed === node || removed.contains(node)) release(node);
        }
        for (const added of record.addedNodes) if (root.contains(added)) scan(added);
      }
      const element = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      if (element) {
        const target = element.closest('[data-mw-node]');
        if (target) consider(target);
      }
    }
  };
  const annotate = () => process(observer.takeRecords());
  const normalize = () => {
    if (disposed || changing || composing || !focused()) return;
    const saved = nativeRange(root);
    if (!saved) return;
    let range = saved.range;
    if (range.collapsed) {
      const atom = atomAncestor(context, range.startContainer);
      if (!atom) return;
      const prefix = document.createRange();
      prefix.selectNodeContents(atom);
      prefix.setEnd(range.startContainer, range.startOffset);
      const after = prefix.toString().length * 2 >= (atom.textContent?.length ?? 0);
      range = document.createRange();
      if (after) range.setStartAfter(atom);
      else range.setStartBefore(atom);
      range.collapse(true);
    }
    else range = expandAtoms(context, range);
    if (!sameRange(saved.range, range)) {
      changing = true;
      try { applyRange(saved.selection, range, saved.backward); }
      finally { changing = false; }
    }
  };
  const mutate = (original: Range, target: Range, replacement?: DocumentFragment | string): boolean => {
    const flow = ordinaryAtomRange(context, target);
    if (!flow || !active()) return false;
    const generation = revision;
    let accepted = false;
    changing = true;
    try {
      editor.transact(() => {
        const current = nativeRange(root);
        if (!active() || generation !== revision || !current || !sameRange(current.range, original)
          || !root.contains(flow) || !ordinaryAtomRange(context, target)) return;
        const range = target.cloneRange();
        range.deleteContents();
        range.collapse(true);
        if (replacement) {
          const content = typeof replacement === 'string' ? document.createTextNode(replacement) : replacement;
          const tail = content.nodeType === 11 ? content.lastChild : content;
          range.insertNode(content);
          if (tail) range.setStartAfter(tail);
          range.collapse(true);
        }
        if (!flow.textContent && !flow.querySelector('br,img,hr')) {
          const br = document.createElement('br');
          flow.append(br);
          range.setStartBefore(br);
          range.collapse(true);
        }
        applyRange(current.selection, range);
        accepted = true;
      });
    }
    finally {
      changing = false;
      annotate();
    }
    return accepted;
  };
  const cancel = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const deletion = (range: Range, backward: boolean): Range | undefined => {
    if (!range.collapsed) return touchedAtoms(context, range).length ? expandAtoms(context, range) : undefined;
    const atom = adjacentAtom(context, range, backward ? -1 : 1);
    if (!atom) return;
    const result = document.createRange();
    result.selectNode(atom);
    return result;
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !event.cancelable || disposed || composing || event.isComposing || event.keyCode === 229 || !focused()) return;
    normalize();
    const saved = nativeRange(root);
    if (!saved || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (!saved.range.collapsed && !event.shiftKey) return;
      const focus = document.createRange();
      focus.setStart(saved.selection.focusNode!, saved.selection.focusOffset);
      focus.collapse(true);
      const flow = atomFlow(context, focus.startContainer);
      if (!flow) return;
      const rtl = document.defaultView!.getComputedStyle(flow).direction === 'rtl';
      const direction = (event.key === 'ArrowRight') !== rtl ? 1 : -1;
      const atom = adjacentAtom(context, focus, direction);
      if (!atom) return;
      const next = document.createRange();
      if (direction > 0) next.setStartAfter(atom);
      else next.setStartBefore(atom);
      next.collapse(true);
      cancel(event);
      if (event.shiftKey) saved.selection.setBaseAndExtent(saved.selection.anchorNode!, saved.selection.anchorOffset, next.startContainer, next.startOffset);
      else applyRange(saved.selection, next);
      return;
    }
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    const range = deletion(saved.range, event.key === 'Backspace');
    if (!range) return;
    cancel(event);
    if (active()) mutate(saved.range, range);
  };
  const beforeinput = (event: InputEvent) => {
    if (event.defaultPrevented || !event.cancelable || disposed || event.isComposing || composing) return;
    const saved = nativeRange(root);
    if (!saved) return;
    const backward = event.inputType === 'deleteContentBackward';
    const target = event.inputType.startsWith('delete') ? deletion(saved.range, backward)
      : touchedAtoms(context, saved.range).length ? expandAtoms(context, saved.range) : undefined;
    if (!target) return;
    cancel(event);
    if (!active()) return;
    if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') mutate(saved.range, target);
    else if (event.inputType === 'insertText' && typeof event.data === 'string') mutate(saved.range, target, event.data);
  };
  const clipboard = (event: ClipboardEvent) => {
    if (disposed || event.defaultPrevented || !event.cancelable || composing || !event.clipboardData) return;
    const selected = nativeRange(root);
    if (!selected) return;
    const table = editor.getPlugin<() => readonly [readonly Element[], unknown]>('tables:selection');
    if (table?.()[0].some((cell) => root.contains(cell))) return;
    const data = event.clipboardData;
    if (event.type === 'paste') {
      if (data.files.length) return;
      const html = data.getData('text/html');
      let incoming: ReturnType<typeof editor.schema.parseHTML> | undefined;
      const ownPayload = html.includes(context.name) && html.includes('data-mw-node');
      try { if (ownPayload) incoming = editor.schema.parseHTML(html); }
      catch { cancel(event); return; }
      const queue = [...(incoming?.children ?? [])];
      let hasIncoming = false;
      while (queue.length) {
        const node = queue.pop()!;
        if (node.type !== 'element') continue;
        if (node.attributes['data-mw-node'] === context.name) { hasIncoming = true; break; }
        queue.push(...node.children);
      }
      if (!hasIncoming && !touchedAtoms(context, selected.range).length) return;
      cancel(event);
      const target = expandAtoms(context, selected.range);
      if (!active() || !ordinaryAtomRange(context, target)) return;
      if (!html) { mutate(selected.range, target, data.getData('text/plain')); return; }
      let model: ReturnType<typeof editor.schema.parseHTML>;
      try { model = incoming ?? editor.schema.parseHTML(html); }
      catch { return; }
      const singleParagraph = model.children.length === 1 && model.children[0].type === 'element' && model.children[0].tag === 'p';
      const inline = new Set(['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br']);
      if (!singleParagraph && model.children.some((node) => node.type === 'element' && !inline.has(node.tag))) return;
      const fragment = editor.schema.renderDocument(model);
      const source = singleParagraph ? fragment.firstElementChild! : fragment;
      if ([...source.querySelectorAll('*')].some((node) => node.hasAttribute('data-mw-node')
        ? node.getAttribute('data-mw-node') !== context.name
        : !inline.has(node.localName))) return;
      const payload = document.createDocumentFragment();
      payload.append(...source.childNodes);
      mutate(selected.range, target, payload);
      return;
    }
    if (!touchedAtoms(context, selected.range).length) return;
    const range = expandAtoms(context, selected.range);
    cancel(event);
    if (!ordinaryAtomRange(context, range) || range.collapsed) return;
    const holder = document.createElement('div');
    holder.append(range.cloneContents());
    const html = editor.schema.sanitizeHTML(holder.innerHTML);
    const generation = revision;
    const handle = event.type === 'cut' ? editor.selection.capture() : undefined;
    try {
      data.setData('text/html', html);
      data.setData('text/plain', range.toString());
      if (event.type === 'cut' && handle && editor.selection.isCurrent(handle) && generation === revision && active()) mutate(selected.range, range);
    }
    finally { if (handle) editor.selection.release(handle); }
  };
  const listen = (name: string, listener: EventListener) => {
    root.addEventListener(name, listener, true);
    cleanups.push(() => root.removeEventListener(name, listener, true));
  };
  const observer = new document.defaultView!.MutationObserver(process);
  try {
    scan(root);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-mw-node', 'contenteditable'] });
    listen('keydown', keydown as EventListener);
    listen('beforeinput', beforeinput as EventListener);
    for (const name of ['copy', 'cut', 'paste']) listen(name, clipboard as EventListener);
    listen('compositionstart', () => { composing = true; });
    listen('compositionend', () => { composing = false; annotate(); normalize(); });
    cleanups.push(editor.onSelectionChange(normalize), editor.subscribe(() => { revision++; annotate(); }));
  }
  catch (error) {
    observer.disconnect();
    for (const stop of cleanups) stop();
    for (const node of [...owned.keys()]) release(node);
    throw error;
  }
  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    for (const stop of cleanups) stop();
    for (const node of [...owned.keys()]) release(node);
  };
};
