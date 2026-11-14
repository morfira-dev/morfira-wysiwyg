import type { EditorOptions, EditorPlugin, SchemaNodeSpec } from '@morfira-dev/wysiwyg-core';

export interface MinimalPresetOptions extends Omit<EditorOptions, 'plugins' | 'schema'> {
  plugins?: readonly EditorPlugin[];
  schema?: readonly SchemaNodeSpec[];
}
