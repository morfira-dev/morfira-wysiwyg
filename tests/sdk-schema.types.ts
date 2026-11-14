import { createDocumentSchema } from '@morfira-dev/wysiwyg';
import type { DocumentSchema, SchemaAttributeSpec, SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const rules = { type: 'enum', values: ['note', 'warning'], required: true } as const satisfies SchemaAttributeSpec;
const node = { name: 'app:callout', kind: 'block', tag: 'blockquote', attributes: { 'data-tone': rules } } as const satisfies SchemaNodeSpec;
const schema: DocumentSchema = createDocumentSchema([node]);
void schema;

// @ts-expect-error custom tags are not supported in the safe phase-1 schema
const arbitraryTag: SchemaNodeSpec = { name: 'app:widget', kind: 'block', tag: 'app-widget' };
// @ts-expect-error integer rules require explicit ordered bounds
const unbounded: SchemaAttributeSpec = { type: 'integer' };
// @ts-expect-error validators are declarative rather than arbitrary runtime callbacks
const callback: SchemaAttributeSpec = { type: 'custom', validate: (value: string) => value };
// @ts-expect-error schema method properties are immutable
schema.parseHTML = () => ({ version: 1, children: [] });
void arbitraryTag;
void unbounded;
void callback;
