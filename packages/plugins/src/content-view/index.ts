import { createDocumentSchema } from '@morfira-dev/wysiwyg-core';
import type { DocumentNode, EditorDocument } from '@morfira-dev/wysiwyg-core';
import type { ContentViewController, ContentViewOptions } from './types.js';

export type { ContentViewController, ContentViewOptions } from './types.js';

const resourceAttributes = new Set(['href', 'src', 'srcset', 'target', 'rel', 'download', 'ping', 'poster', 'action', 'formaction', 'background', 'xlink:href']);
const checkedLabel = (value: unknown, fallback: string): string => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > 160 || /[\u0000-\u001f\u007f-\u009f]/.test(value))
    throw new TypeError('Content view labels must be bounded literal text.');
  return value;
};

/** Read-only presentation of saved data, independent from editor lifetime. */
export const createContentView = (host: HTMLElement, options: ContentViewOptions = {}): ContentViewController => {
  const owner = host?.ownerDocument;
  const view = owner?.defaultView;
  if (!view || !(host instanceof view.HTMLElement) || owner !== document || !host.isConnected
    || host.namespaceURI !== 'http://www.w3.org/1999/xhtml' || host.childNodes.length
    || host.closest('[contenteditable]')) throw new TypeError('Content view needs an empty connected external HTML host.');
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some((key) => !['value', 'schema', 'images', 'links', 'label', 'imagePlaceholder'].includes(key)))
    throw new TypeError('Expected content view options.');
  const { images = 'omit', links = 'text' } = options;
  if (!['omit', 'load'].includes(images) || !['text', 'navigate'].includes(links))
    throw new TypeError('Invalid content view resource policy.');
  const originalParent = host.parentNode;
  const label = checkedLabel(options.label, '');
  const placeholder = checkedLabel(options.imagePlaceholder, '[Image]');
  const schema = createDocumentSchema(options.schema);
  let value = typeof options.value === 'string'
    ? schema.parseHTML(options.value)
    : schema.validateDocument(options.value === undefined ? { version: 1, children: [] } : options.value);
  let disposed = false;
  const element = owner.createElement('article');
  element.className = 'mw-content-view';
  if (label) element.setAttribute('aria-label', label);
  const owned = (): boolean => host.ownerDocument === owner && element.ownerDocument === owner
    && host.isConnected && host.parentNode === originalParent && element.isConnected && element.parentNode === host && !host.closest('[contenteditable]');
  const assertCurrent = (): void => {
    if (disposed) throw new Error('Content view has been destroyed.');
    if (!owned()) throw new Error('Content view host ownership was lost.');
  };
  const resolvedURL = (source: string | undefined, protocols: readonly string[]): string | undefined => {
    if (source === undefined) return;
    try {
      const resolved = new URL(source, owner.baseURI);
      return protocols.includes(resolved.protocol) ? resolved.href : undefined;
    }
    catch { return undefined; }
  };
  const render = (input: EditorDocument): DocumentFragment => {
    const node = (input: DocumentNode): Node => {
      if (input.type === 'text') return owner.createTextNode(input.text);
      const imageSource = input.tag === 'img' && images === 'load'
        ? resolvedURL(input.attributes.src, ['http:', 'https:']) : undefined;
      if (input.tag === 'img' && imageSource === undefined) {
        const omitted = owner.createElement('span');
        omitted.className = 'mw-content-view-image';
        omitted.textContent = input.attributes.alt || placeholder;
        return omitted;
      }
      const output = owner.createElement(input.tag);
      for (const [key, attribute] of Object.entries(input.attributes)) {
        if (resourceAttributes.has(key)) {
          if (input.tag === 'img' && key === 'src' && imageSource !== undefined) output.setAttribute(key, imageSource);
          else if (input.tag === 'a' && key === 'href' && links === 'navigate') {
            const destination = resolvedURL(attribute, ['http:', 'https:', 'mailto:', 'tel:']);
            if (destination !== undefined) output.setAttribute('href', destination);
          }
          continue;
        }
        output.setAttribute(key, attribute);
      }
      if (input.tag === 'a' && output.hasAttribute('href')) {
        output.setAttribute('target', '_blank');
        output.setAttribute('rel', 'noopener noreferrer');
      }
      for (const child of input.children) output.append(node(child));
      return output;
    };
    const fragment = owner.createDocumentFragment();
    for (const child of input.children) fragment.append(node(child));
    return fragment;
  };
  const replace = (next: EditorDocument): void => {
    assertCurrent();
    const fragment = render(next);
    assertCurrent();
    element.replaceChildren(fragment);
    value = next;
  };
  // Complete codec validation precedes creation of resource-bearing presentation.
  element.append(render(value));
  host.append(element);
  return {
    element,
    setHTML: (html) => { assertCurrent(); replace(schema.parseHTML(html)); },
    setJSON: (input) => { assertCurrent(); replace(schema.validateDocument(input)); },
    getHTML: () => { assertCurrent(); return schema.documentHTML(value); },
    getJSON: () => { assertCurrent(); return schema.validateDocument(value); },
    destroy: () => {
      if (disposed) return;
      disposed = true;
      value = { version: 1, children: [] };
      element.replaceChildren();
      element.remove();
    },
  };
};
