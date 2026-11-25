import { createDocumentSchema } from '@morfira-dev/wysiwyg';
import type { DocumentNode, Editor, SchemaNodeSpec } from '@morfira-dev/wysiwyg';
import { nodeCommands, nodeExtension } from '@morfira-dev/wysiwyg/sdk';
import type { ApplicationExtensionBundle, ApplicationNodeKind, ApplicationNodeTarget, ApplicationVariableKey, ApplicationDraftRevision } from './types.js';

export const applicationNodeNames = {
  entity: 'app:entity', callout: 'app:callout', variable: 'app:variable',
} as const;

/** Application-owned definitions shared by the editor and published reader. */
export const createApplicationExtensions = (): ApplicationExtensionBundle => {
  const schema: readonly SchemaNodeSpec[] = [
    { name: applicationNodeNames.entity, kind: 'inline', tag: 'span',
      attributes: { 'data-id': { type: 'text', required: true, minLength: 1, maxLength: 64, singleLine: true } },
      content: { type: 'text', minLength: 1, maxLength: 128, singleLine: true } },
    { name: applicationNodeNames.callout, kind: 'block', tag: 'blockquote',
      attributes: { 'data-tone': { type: 'enum', values: ['info', 'warning'], required: true } },
      content: { type: 'text', minLength: 1, maxLength: 2000 } },
    { name: applicationNodeNames.variable, kind: 'inline', tag: 'span',
      attributes: { 'data-key': { type: 'enum', values: ['customer', 'order'], required: true } },
      content: { type: 'text', minLength: 1, maxLength: 128, singleLine: true } },
  ];
  for (const spec of schema) {
    for (const rule of Object.values(spec.attributes ?? {})) {
      if (rule.type === 'enum') Object.freeze(rule.values);
      Object.freeze(rule);
    }
    Object.freeze(spec.attributes);
    Object.freeze(spec.content);
    Object.freeze(spec);
  }
  Object.freeze(schema);
  const codec = createDocumentSchema(schema);
  const revisions = new WeakMap<Editor, ApplicationDraftRevision>();
  const owns = (editor: Editor, kind: ApplicationNodeKind, node: HTMLElement): boolean =>
    editor.surface.contains(node) && node.getAttribute('data-mw-node') === applicationNodeNames[kind];
  const isCurrent = (target: ApplicationNodeTarget): boolean => {
    try {
      const state = revisions.get(target.editor);
      return !!state && !state.disposed && state.revision === target.revision
        && owns(target.editor, target.kind, target.node) && target.editor.getHTML() === target.html;
    }
    catch { return false; }
  };
  return {
    schema,
    plugins: [...schema.map((spec) => nodeExtension(spec, { atomic: spec.kind === 'inline' })), {
      name: 'app:extension-draft-ownership',
      setup: (editor) => {
        const state: ApplicationDraftRevision = { revision: 0, disposed: false };
        revisions.set(editor, state);
        const invalidate = () => { state.revision++; };
        const stopChange = editor.subscribe(invalidate);
        const stopReadOnly = editor.events.on('readonlychange', (readOnly) => { if (readOnly) invalidate(); });
        editor.surface.addEventListener('compositionstart', invalidate);
        return () => {
          state.disposed = true;
          invalidate();
          stopChange();
          stopReadOnly();
          editor.surface.removeEventListener('compositionstart', invalidate);
          revisions.delete(editor);
        };
      },
    }],
    commands: (editor, kind) => nodeCommands(editor, applicationNodeNames[kind]),
    capture: (editor, kind, node) => {
      const state = revisions.get(editor);
      return state && !state.disposed && owns(editor, kind, node)
        ? { editor, kind, node, html: editor.getHTML(), revision: state.revision } : undefined;
    },
    isCurrent,
    update: (target, text, attributes) => isCurrent(target)
      && nodeCommands(target.editor, applicationNodeNames[target.kind]).update(target.node, attributes, text),
    remove: (target) => isCurrent(target)
      && nodeCommands(target.editor, applicationNodeNames[target.kind]).remove(target.node),
    expand: (document, values) => {
      const input = codec.validateDocument(document);
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Expected literal template values.');
      for (const key of Object.keys(values)) {
        if (!['customer', 'order'].includes(key)) throw new TypeError('Unknown template value key.');
        const value = values[key as ApplicationVariableKey];
        if (typeof value !== 'string' || value.length > 2000 || /[\u0000-\u001f\u007f-\u009f]/.test(value))
          throw new TypeError('Expected a bounded literal template value.');
      }
      let variables = 0;
      let replacementLength = 0;
      const unresolved = new Set<ApplicationVariableKey>();
      const project = (node: DocumentNode): DocumentNode => {
        if (node.type === 'text') return node;
        if (node.attributes['data-mw-node'] === applicationNodeNames.variable) {
          if (++variables > 100) throw new RangeError('Too many template variables.');
          const key = node.attributes['data-key'] as ApplicationVariableKey;
          if (!Object.hasOwn(values, key)) { unresolved.add(key); return node; }
          const text = values[key]!;
          replacementLength += text.length;
          if (replacementLength > 20000) throw new RangeError('Template expansion exceeds the text budget.');
          return { type: 'text', text };
        }
        return { ...node, attributes: { ...node.attributes }, children: node.children.map(project) };
      };
      const result = codec.validateDocument({ version: 1, children: input.children.map(project) });
      return { document: result, unresolved: [...unresolved] };
    },
  };
};
