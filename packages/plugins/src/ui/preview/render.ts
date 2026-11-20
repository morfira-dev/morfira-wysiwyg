import type { DocumentNode, EditorDocument } from '@morfira-dev/wysiwyg-core';

const resourceAttributes = new Set(['href', 'src', 'srcset', 'target', 'rel', 'download', 'ping', 'poster', 'action', 'formaction', 'background', 'xlink:href']);

/** Input has already passed the instance schema before any live nodes exist. */
export const renderPreview = (document: Document, value: EditorDocument, images: 'omit' | 'load', omitted: string): DocumentFragment => {
  const render = (node: DocumentNode): Node => {
    if (node.type === 'text') return document.createTextNode(node.text);
    if (node.tag === 'img' && images === 'omit') {
      const placeholder = document.createElement('span');
      placeholder.className = 'mw-preview-image';
      placeholder.textContent = node.attributes.alt || omitted;
      return placeholder;
    }
    const element = document.createElement(node.tag);
    for (const [name, value] of Object.entries(node.attributes)) {
      if (resourceAttributes.has(name) && !(node.tag === 'img' && name === 'src' && images === 'load')) continue;
      element.setAttribute(name, value);
    }
    for (const child of node.children) element.append(render(child));
    return element;
  };
  const fragment = document.createDocumentFragment();
  for (const child of value.children) fragment.append(render(child));
  return fragment;
};
