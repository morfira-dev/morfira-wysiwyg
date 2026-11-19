import type { Editor, SchemaNodeSpec } from '@morfira-dev/wysiwyg-core';
import type { Candidate } from '../suggestions/engine.types.js';
import type { MentionOption } from '../suggestions/types.js';

export const mentionNodeName = 'morfira:mention';
export const mentionIDAttribute = 'data-mention-id';
export const validMentionID = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 1 && value.length <= 256 && !/[\u0000-\u001f\u007f\u2028\u2029]/.test(value);

/** Fresh definitions let an application validate references without a provider. */
export const createMentionSchema = (): SchemaNodeSpec => ({
  name: mentionNodeName,
  kind: 'inline',
  tag: 'span',
  attributes: {
    [mentionIDAttribute]: { type: 'text', required: true, minLength: 1, maxLength: 256, singleLine: true },
  },
});

/** Called only inside the suggestion engine's validated choice transaction. */
export const insertMention = (editor: Editor, candidate: Candidate, item: MentionOption): void => {
  const first = candidate.leaves[0];
  const last = candidate.leaves.at(-1)!;
  if (first.node === last.node) first.node.replaceData(first.from, first.to - first.from, '');
  else {
    first.node.data = first.node.data.slice(0, first.from);
    for (const leaf of candidate.leaves.slice(1, -1)) leaf.node.data = '';
    last.node.data = last.node.data.slice(last.to);
  }
  const document = editor.surface.ownerDocument;
  const mention = document.createElement('span');
  mention.setAttribute('data-mw-node', mentionNodeName);
  mention.setAttribute(mentionIDAttribute, item.id);
  mention.textContent = `@${item.label}`;
  const caret = document.createRange();
  caret.setStart(first.node, first.from);
  caret.collapse(true);
  caret.insertNode(mention);
  const space = document.createTextNode(' ');
  mention.after(space);
  caret.setStart(space, 1);
  caret.collapse(true);
  candidate.block.normalize();
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
};
