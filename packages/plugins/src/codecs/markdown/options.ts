import { createDocumentSchema } from '@morfira-dev/wysiwyg-core';
import { checklistSchema } from '../../checklists/schema.js';
import type { MarkdownCodecOptions } from './types.js';

export const markdownOptions = (input: MarkdownCodecOptions = {}): Required<MarkdownCodecOptions> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some((key) => !['taskLists', 'tableAlignment'].includes(key)))
    throw new TypeError('Unsupported Markdown codec options.');
  for (const value of Object.values(input))
    if (value !== undefined && typeof value !== 'boolean') throw new TypeError('Markdown codec flags must be boolean.');
  return { taskLists: input.taskLists === true, tableAlignment: input.tableAlignment === true };
};

export const markdownSchema = (options: Required<MarkdownCodecOptions>) =>
  createDocumentSchema(options.taskLists ? [checklistSchema] : []);
