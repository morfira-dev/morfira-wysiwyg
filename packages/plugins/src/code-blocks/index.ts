import type { Editor, EditorPlugin, SchemaNodeSpec } from '@morfira-dev/wysiwyg-core';
import { setupCodeInput } from './input.js';
import type { CodeBlockCommands, CodeBlockDescriptor, CodeBlockOptions, CodeBlockValue } from './types.js';
export type { CodeBlockCommands, CodeBlockDescriptor, CodeBlockOptions, CodeBlockValue } from './types.js';
export const codeBlockNodeName = 'morfira:code-block';
export const defaultCodeLanguages: readonly string[] = Object.freeze(['plaintext', 'typescript', 'javascript', 'html', 'css', 'json', 'bash']);

const checkedLanguages = (value: readonly string[] | undefined): readonly string[] => {
  const input = value ?? defaultCodeLanguages;
  if (!Array.isArray(input) || !input.length || input.length > 32
    || input.some((id) => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(id))
    || new Set(input).size !== input.length) throw new TypeError('Code languages require 1–32 unique lowercase IDs.');
  const result = input.includes('plaintext') ? [...input] : ['plaintext', ...input];
  if (result.length > 32) throw new TypeError('Code languages including plaintext must not exceed 32.');
  return Object.freeze(result);
};

export const codeBlocks = (options: CodeBlockOptions = {}): EditorPlugin => {
  const languages = checkedLanguages(options.languages);
  const definition: SchemaNodeSpec = { name: codeBlockNodeName, kind: 'block', tag: 'pre',
    attributes: { 'data-language': { type: 'enum', values: languages, required: true } },
    content: { type: 'text', minLength: 0, maxLength: 20000 } };
  return { name: 'code-blocks', schema: [definition], setup: (editor) => {
    const root = editor.surface;
    const document = root.ownerDocument;
    let disposed = false;
    let composing = false;
    const read = (target: HTMLElement): CodeBlockDescriptor | undefined => {
      if (disposed || !target || target.parentElement !== root || target.namespaceURI !== 'http://www.w3.org/1999/xhtml'
        || target.localName !== 'pre' || target.getAttribute('data-mw-node') !== codeBlockNodeName
        || [...target.childNodes].some((node) => node.nodeType !== 3)
        || [...target.attributes].some((attribute) => !['data-mw-node', 'data-language'].includes(attribute.name))) return;
      const source = target.textContent ?? '';
      const language = target.getAttribute('data-language') ?? '';
      if (source.length > 20000 || !languages.includes(language)) return;
      return { source, language };
    };
    const checked = (value: CodeBlockValue): CodeBlockDescriptor => {
      if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some((key) => !['source', 'language'].includes(key))
        || typeof value.source !== 'string' || value.source.length > 20000)
        throw new TypeError('Code source must be literal text bounded to 20000 UTF-16 units.');
      const language = value.language ?? 'plaintext';
      if (!languages.includes(language)) throw new TypeError('The code language is not registered.');
      return { source: value.source.replace(/\r\n?/g, '\n'), language };
    };
    const select = (node: Node, offset: number) => {
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const native = document.getSelection();
      native?.removeAllRanges();
      native?.addRange(range);
    };
    const paragraph = () => {
      const node = document.createElement('p');
      node.append(document.createElement('br'));
      return node;
    };
    const mutateTarget = (target: HTMLElement, mutate: () => void): boolean => {
      if (disposed || composing || editor.isReadOnly() || !read(target)) return false;
      const before = editor.getHTML();
      const original = target.outerHTML;
      let changed = false;
      editor.transact(() => {
        if (disposed || composing || editor.isReadOnly() || !read(target)
          || target.outerHTML !== original || editor.getHTML() !== before) return;
        mutate();
        changed = true;
      });
      return changed;
    };
    const commands: CodeBlockCommands = {
      languages,
      get: read,
      insert: (value) => {
        if (disposed || composing || editor.isReadOnly()) return false;
        const valid = checked(value);
        const handle = editor.selection.capture();
        const range = handle ? editor.selection.getRange(handle) : undefined;
        if (!handle || !range) return false;
        try {
          if (!range.collapsed) return false;
          const element = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
          const body = element?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6');
          if (!body || body.parentElement !== root || body.hasAttribute('data-mw-node')
            || body.querySelector('img,br[data-mw-node],[data-mw-node],figure,table,pre')
            || element?.closest('[contenteditable="false"]')) return false;
          const html = editor.getHTML();
          let changed = false;
          editor.transact(() => {
            const current = document.getSelection();
            const native = current?.rangeCount === 1 ? current.getRangeAt(0) : undefined;
            if (disposed || composing || editor.isReadOnly() || !editor.selection.isCurrent(handle)
              || editor.getHTML() !== html || body.parentElement !== root || !native || !native.collapsed
              || native.startContainer !== range.startContainer || native.startOffset !== range.startOffset) return;
            const before = document.createRange();
            before.selectNodeContents(body);
            before.setEnd(range.startContainer, range.startOffset);
            const after = document.createRange();
            after.selectNodeContents(body);
            after.setStart(range.startContainer, range.startOffset);
            const prefix = before.cloneContents();
            const suffix = after.cloneContents();
            const code = editor.schema.renderDocument({ version: 1, children: [{ type: 'element', tag: 'pre',
              attributes: { 'data-mw-node': codeBlockNodeName, 'data-language': valid.language },
              children: [{ type: 'text', text: valid.source }] }] }).firstElementChild!;
            const right = body.cloneNode(false) as HTMLElement;
            right.append(suffix);
            if (!right.hasChildNodes()) right.append(document.createElement('br'));
            body.replaceChildren(prefix);
            if (!body.hasChildNodes()) body.append(document.createElement('br'));
            body.after(code, right);
            select(code.firstChild ?? code, code.firstChild?.textContent?.length ?? 0);
            changed = true;
          });
          return changed;
        }
        finally { editor.selection.release(handle); }
      },
      update: (target, value) => {
        const valid = checked(value);
        const old = read(target);
        if (!old || old.source === valid.source && old.language === valid.language) return false;
        return mutateTarget(target, () => {
          target.setAttribute('data-language', valid.language);
          target.replaceChildren(document.createTextNode(valid.source));
          select(target.firstChild!, valid.source.length);
        });
      },
      remove: (target) => mutateTarget(target, () => {
        const next = paragraph();
        target.replaceWith(next);
        select(next, 0);
      }),
      exit: (target) => mutateTarget(target, () => {
        const next = paragraph();
        target.after(next);
        select(next, 0);
      }),
    };
    const composingStart = () => { composing = true; };
    const composingEnd = () => { composing = false; };
    root.addEventListener('compositionstart', composingStart);
    root.addEventListener('compositionend', composingEnd);
    const unregister = editor.providePlugin('code-blocks', commands);
    const stopInput = setupCodeInput({ editor, commands, isComposing: () => composing || disposed });
    const stopReplacement = editor.subscribe((change) => {
      if (change.source === 'api') composing = false;
    });
    const stopReadonly = editor.events.on('readonlychange', (readonly) => {
      if (readonly) composing = false;
    });
    return () => {
      if (disposed) return;
      disposed = true;
      stopInput();
      stopReplacement();
      stopReadonly();
      root.removeEventListener('compositionstart', composingStart);
      root.removeEventListener('compositionend', composingEnd);
      unregister();
    };
  } };
};

export const codeBlockCommands = (editor: Editor): CodeBlockCommands => {
  const commands = editor.getPlugin<CodeBlockCommands>('code-blocks');
  if (!commands) throw new Error('Install codeBlocks() before using code block commands.');
  return commands;
};
