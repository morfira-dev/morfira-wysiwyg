import type { SchemaAttributesSpec } from '@morfira-dev/wysiwyg-core';

export const checklistAttribute = 'data-checklist-checked';
export const checklistSchema: SchemaAttributesSpec = {
  name: 'morfira:checklist-attributes',
  kind: 'attributes',
  tag: 'li',
  attributes: {
    [checklistAttribute]: { type: 'enum', values: ['false', 'true'] },
  },
  split: { [checklistAttribute]: 'false' },
};
