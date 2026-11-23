import { createDocumentSchema } from '@morfira-dev/wysiwyg-core';
import type { Editor, EditorPlugin, ElementNode, SchemaNodeSpec, TextMappingStep } from '@morfira-dev/wysiwyg-core';
import type { NodeCommands, NodeExtensionOptions } from '../types.js';
import type { NodeExtensionRegistration } from '../internal-types.js';
import { setupAtoms } from './atoms.js';

export const nodeExtensionKey = (name: string): string => `sdk:node:${name}`;

export const registeredNode = (editor: Editor, name: string): NodeExtensionRegistration => {
  if (typeof name !== 'string' || name.length > 128 || !/^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/.test(name))
    throw new TypeError('A namespaced semantic node name is required.');
  const registration = editor.getPlugin<NodeExtensionRegistration>(nodeExtensionKey(name));
  if (!registration) throw new Error(`Install nodeExtension for ${name} first.`);
  return registration;
};

/** Schema compilation stays core-owned; this plugin adds bounded editing helpers. */
export const nodeExtension = (spec: SchemaNodeSpec, options: NodeExtensionOptions = {}): EditorPlugin => {
  if (options.atomic !== undefined && typeof options.atomic !== 'boolean') throw new TypeError('atomic must be boolean.');
  const definition = structuredClone(spec);
  createDocumentSchema([definition]);
  if (definition.content) Object.freeze(definition.content);
  if (definition.attributes) {
    for (const rule of Object.values(definition.attributes)) {
      if (rule.type === 'enum') Object.freeze(rule.values);
      Object.freeze(rule);
    }
    Object.freeze(definition.attributes);
  }
  Object.freeze(definition);
  const atomic = options.atomic === true;
  if (atomic && (definition.kind !== 'inline' || definition.tag !== 'span' || definition.content?.type !== 'text'
    || !definition.content.singleLine || (definition.content.minLength ?? 0) < 1 || (definition.content.maxLength ?? 2049) > 2048))
    throw new TypeError('Atoms require inline spans with nonempty single-line text bounded to 2048 UTF-16 units.');
  return {
    name: `sdk-node:${definition.name}`,
    schema: Object.freeze([definition]),
    setup: (editor) => {
      let disposed = false;
      const root = editor.surface;
      const owns = (node: Element): node is HTMLElement => {
        if (disposed || !root.contains(node) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
          || node.localName !== definition.tag || node.getAttribute('data-mw-node') !== definition.name) return false;
        for (let parent = node.parentElement; parent && parent !== root; parent = parent.parentElement)
          if (parent.namespaceURI !== 'http://www.w3.org/1999/xhtml' || parent.hasAttribute('data-mw-node')
            || parent.getAttribute('contenteditable') === 'false') return false;
        return true;
      };
      const guarded = (mutate: () => void, mapping: readonly TextMappingStep[], accepts: () => boolean): boolean => {
        const refusal = new Error('The semantic node target changed during focus.');
        let accepted = false;
        try {
          editor.transact(() => {
            if (disposed || editor.isReadOnly() || !accepts()) throw refusal;
            mutate();
            accepted = true;
          }, { mapping });
        }
        catch (error) {
          if (error !== refusal) throw error;
        }
        return accepted;
      };
      const checked = (text: string, attributes: Readonly<Record<string, string>> = {}): ElementNode => {
        if (typeof text !== 'string' || text.length > 20000 || !attributes || typeof attributes !== 'object' || Array.isArray(attributes))
          throw new TypeError('A semantic node requires bounded literal text and an attribute record.');
        const value = editor.schema.validateDocument({ version: 1, children: [{ type: 'element', tag: definition.tag,
          attributes: { ...attributes, 'data-mw-node': definition.name }, children: [{ type: 'text', text }] }] });
        const node = value.children[0];
        if (node.type !== 'element' || node.attributes['data-mw-node'] !== definition.name)
          throw new TypeError('The node does not belong to this schema.');
        return node;
      };
      const commands: NodeCommands = {
        insert: (text, attributes) => {
          if (disposed || editor.isReadOnly()) return false;
          const node = checked(text, attributes);
          const selection = editor.getSelection();
          if (!selection) return false;
          const handle = editor.selection.capture();
          if (!handle) return false;
          const range = editor.selection.getRange(handle)!;
          const before = editor.getHTML();
          try {
            const accepted = guarded(() => editor.insertHTML(editor.schema.documentHTML({ version: 1, children: [node] })),
              [{ from: selection.index, to: selection.index + selection.length, insert: text }], () => {
                const native = root.ownerDocument.getSelection();
                const current = native?.rangeCount === 1 ? native.getRangeAt(0) : undefined;
                return editor.selection.isCurrent(handle) && editor.getHTML() === before && !!current
                  && current.startContainer === range.startContainer && current.startOffset === range.startOffset
                  && current.endContainer === range.endContainer && current.endOffset === range.endOffset;
              });
            return !disposed && accepted && editor.getHTML() !== before;
          }
          finally { editor.selection.release(handle); }
        },
        update: (target, attributes, text) => {
          if (disposed || editor.isReadOnly() || !owns(target)) return false;
          const originalText = target.textContent ?? '';
          const node = checked(text ?? originalText, attributes);
          const prefix = root.ownerDocument.createRange();
          prefix.selectNodeContents(root);
          prefix.setEndBefore(target);
          const from = prefix.toString().length;
          const before = editor.getHTML();
          const previousParent = target.parentNode;
          const previousNode = target.previousSibling;
          const nextNode = target.nextSibling;
          let changed = false;
          guarded(() => {
            const replacement = editor.schema.renderDocument({ version: 1, children: [node] }).firstElementChild!;
            const old = target.outerHTML;
            for (const attribute of [...target.attributes])
              if (attribute.name !== 'contenteditable') target.removeAttribute(attribute.name);
            for (const attribute of [...replacement.attributes]) target.setAttribute(attribute.name, attribute.value);
            if (text !== undefined && target.textContent !== text) target.replaceChildren(root.ownerDocument.createTextNode(text));
            changed = target.outerHTML !== old;
          }, text === undefined || text === originalText ? [] : [{ from, to: from + originalText.length, insert: text }],
          () => owns(target) && target.parentNode === previousParent && target.previousSibling === previousNode
            && target.nextSibling === nextNode && editor.getHTML() === before);
          return changed;
        },
        remove: (target) => {
          if (disposed || editor.isReadOnly() || !owns(target)) return false;
          const prefix = root.ownerDocument.createRange();
          prefix.selectNodeContents(root);
          prefix.setEndBefore(target);
          const from = prefix.toString().length;
          const length = target.textContent?.length ?? 0;
          const before = editor.getHTML();
          const previousParent = target.parentNode;
          const previousNode = target.previousSibling;
          const nextNode = target.nextSibling;
          let removed = false;
          guarded(() => {
            const parent = target.parentElement!;
            target.remove();
            if (parent !== root && !parent.textContent && !parent.querySelector('br,img,hr')) parent.append(root.ownerDocument.createElement('br'));
            removed = true;
          }, [{ from, to: from + length, insert: '' }],
          () => owns(target) && target.parentNode === previousParent && target.previousSibling === previousNode
            && target.nextSibling === nextNode && editor.getHTML() === before);
          return removed;
        },
      };
      const unregister = editor.providePlugin(nodeExtensionKey(definition.name), { spec: definition, commands, owns, atomic } satisfies NodeExtensionRegistration);
      let stopAtoms: (() => void) | undefined;
      try { if (atomic) stopAtoms = setupAtoms({ editor, owns, name: definition.name }); }
      catch (error) { unregister(); throw error; }
      return () => {
        if (disposed) return;
        disposed = true;
        stopAtoms?.();
        unregister();
      };
    },
  };
};

export const nodeCommands = (editor: Editor, name: string): NodeCommands => registeredNode(editor, name).commands;
