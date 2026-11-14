import type { EditorOptions, EditorPlugin, SchemaContribution } from '@morfira-dev/wysiwyg-core';

export interface MinimalPresetOptions extends Omit<EditorOptions, 'plugins' | 'schema'> {
  plugins?: readonly EditorPlugin[];
  schema?: readonly SchemaContribution[];
}
