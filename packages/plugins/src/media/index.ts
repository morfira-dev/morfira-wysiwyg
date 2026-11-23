import type { Editor, EditorPlugin, SchemaNodeSpec } from '@morfira-dev/wysiwyg-core';
import { nodeExtension, nodeCommands } from '../sdk/node-extension/index.js';
import { mediaReference, parseMediaURL } from './url.js';
import type { MediaCommands, MediaDescriptor, MediaValue } from './types.js';

export { parseMediaURL } from './url.js';
export type { MediaProvider, MediaReference, MediaValue, MediaDescriptor, MediaCommands } from './types.js';
const mediaNodeName = 'morfira:media';
const definition: SchemaNodeSpec = Object.freeze({
  name: mediaNodeName, kind: 'block', tag: 'figure',
  attributes: Object.freeze({
    'data-provider': Object.freeze({ type: 'enum', values: Object.freeze(['youtube', 'vimeo']), required: true }),
    'data-video-id': Object.freeze({ type: 'text', minLength: 1, maxLength: 32, singleLine: true, required: true }),
  }),
  content: Object.freeze({ type: 'text', minLength: 1, maxLength: 256, singleLine: true }),
});

const checkedValue = (value: MediaValue): MediaDescriptor => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !['url', 'title'].includes(key))) throw new TypeError('Invalid media value.');
  const reference = parseMediaURL(value.url);
  const title = value.title === undefined || value.title === '' ? `${reference.provider}: ${reference.id}` : value.title;
  if (typeof title !== 'string' || title.length < 1 || title.length > 256 || /[\u0000-\u001f\u007f\u2028\u2029]/.test(title))
    throw new TypeError('Media titles require 1–256 single-line characters.');
  return Object.freeze({ ...reference, title });
};

const readMediaTarget = (editor: Editor, target: HTMLElement): MediaDescriptor | undefined => {
  if (!target || !editor.surface.contains(target) || target.namespaceURI !== 'http://www.w3.org/1999/xhtml'
    || target.localName !== 'figure' || target.getAttribute('data-mw-node') !== mediaNodeName) return;
  for (let parent = target.parentElement; parent && parent !== editor.surface; parent = parent.parentElement)
    if (parent.namespaceURI !== 'http://www.w3.org/1999/xhtml' || parent.hasAttribute('data-mw-node')
      || parent.getAttribute('contenteditable') === 'false') return;
  if ([...target.attributes].some((attribute) => !['data-mw-node', 'data-provider', 'data-video-id'].includes(attribute.name))
    || [...target.childNodes].some((node) => node.nodeType !== 3)) return;
  try {
    const reference = mediaReference(target.getAttribute('data-provider'), target.getAttribute('data-video-id'));
    const title = target.textContent ?? '';
    if (!title.length || title.length > 256 || /[\u0000-\u001f\u007f\u2028\u2029]/.test(title)) return;
    return Object.freeze({ ...reference, title });
  }
  catch { return; }
};

export const media = (): EditorPlugin => {
  const extension = nodeExtension(definition);
  return {
    name: 'media', schema: extension.schema,
    setup: (editor) => {
      const disposeNode = extension.setup(editor);
      const nodes = nodeCommands(editor, mediaNodeName);
      let disposed = false;
      const commands: MediaCommands = {
        insert: (value) => {
          if (disposed || editor.isReadOnly()) return false;
          const checked = checkedValue(value);
          return nodes.insert(checked.title, { 'data-provider': checked.provider, 'data-video-id': checked.id });
        },
        update: (target, value) => {
          if (disposed || editor.isReadOnly() || !readMediaTarget(editor, target)) return false;
          const checked = checkedValue(value);
          return nodes.update(target, { 'data-provider': checked.provider, 'data-video-id': checked.id }, checked.title);
        },
        remove: (target) => !disposed && !!readMediaTarget(editor, target) && nodes.remove(target),
        get: (target) => disposed ? undefined : readMediaTarget(editor, target),
      };
      let unregister: (() => void) | undefined;
      try { unregister = editor.providePlugin('media', commands); }
      catch (error) { if (typeof disposeNode === 'function') disposeNode(); throw error; }
      return () => {
        if (disposed) return;
        disposed = true;
        unregister?.();
        if (typeof disposeNode === 'function') disposeNode();
      };
    },
  };
};

export const mediaCommands = (editor: Editor): MediaCommands => {
  const commands = editor.getPlugin<MediaCommands>('media');
  if (!commands) throw new Error('Install media() before using media commands.');
  return commands;
};
