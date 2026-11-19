import type { Editor, DocumentNode } from '@morfira-dev/wysiwyg-core';
import { createSuggestions } from '../suggestions/engine.js';
import type { MentionOption, SuggestionController } from '../suggestions/types.js';
export type { MentionOption, SuggestionController, SuggestionState, SuggestionQuery, SuggestionProvider, SuggestionOptions, SuggestionAnchor } from '../suggestions/types.js';
export type { MentionOptions } from './types.js';
import type { MentionOptions } from './types.js';
import type { MentionReference } from './types.js';
import { createMentionSchema, insertMention, mentionIDAttribute, mentionNodeName, validMentionID } from './persistence.js';
import { setupAtomicMentions } from './atomic/index.js';
export const mentions = (options: MentionOptions) => {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Expected mention options.');
  const { persistent = false, atomic = false } = options;
  if (typeof persistent !== 'boolean') throw new TypeError('Mention persistence must be boolean.');
  if (typeof atomic !== 'boolean' || (atomic && !persistent)) throw new TypeError('Atomic mentions require persistent:true.');
  const plugin = createSuggestions('mentions', options, undefined, persistent ? {
    schema: [createMentionSchema({ atomic })],
    insert: insertMention,
  } : undefined);
  if (!atomic) return plugin;
  return {
    ...plugin,
    setup: (editor: Editor) => {
      const stopSuggestions = plugin.setup(editor);
      let stopAtomic: (() => void) | undefined;
      try { stopAtomic = setupAtomicMentions(editor); }
      catch (error) {
        try { stopSuggestions?.(); }
        catch { /* Keep the atomic setup failure after suggestion cleanup. */ }
        throw error;
      }
      return () => {
        const errors: unknown[] = [];
        for (const cleanup of [stopAtomic, stopSuggestions]) {
          try { cleanup?.(); }
          catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'Mention plugin cleanup failed.');
      };
    },
  };
};
export const mentionCommands = (editor: Editor): SuggestionController<MentionOption> => {
  const api = editor.getPlugin<SuggestionController<MentionOption>>('mentions');
  if (!api)
    throw new Error('Install the mentions plugin first.');
  return api;
};

/** Stored IDs are untrusted references, never permission to notify or fetch. */
export const getMentions = (editor: Editor): MentionReference[] => {
  mentionCommands(editor);
  const result: MentionReference[] = [];
  for (const element of editor.surface.querySelectorAll('span[data-mw-node]')) {
    const id = element.getAttribute(mentionIDAttribute);
    if (element.namespaceURI === 'http://www.w3.org/1999/xhtml'
      && element.getAttribute('data-mw-node') === mentionNodeName && validMentionID(id)) {
      try {
        // Retain text-versus-element shape without cloning or rendering content.
        // Atomic schemas reject element children; editable schemas remain compatible.
        const children: DocumentNode[] = [...element.childNodes].flatMap((child): DocumentNode[] => child.nodeType === 3
          ? [{ type: 'text', text: child.textContent ?? '' }]
          : child.nodeType === 1 ? [{ type: 'element', tag: 'span', attributes: {}, children: [] }] : []);
        editor.schema.validateDocument({ version: 1, children: [{
          type: 'element', tag: 'span',
          attributes: { 'data-mw-node': mentionNodeName, [mentionIDAttribute]: id }, children,
        }] });
        result.push({ id, text: element.textContent ?? '' });
      }
      catch { /* Unregistered or malformed DOM metadata does not become an identity. */ }
    }
  }
  return result;
};
