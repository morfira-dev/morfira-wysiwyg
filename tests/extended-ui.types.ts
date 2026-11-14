import type { Editor, EditorOptions } from '@morfira-dev/wysiwyg';
import { createExtendedEditorUI } from '@morfira-dev/wysiwyg/ui/extended';
import type { ExtendedEditorUIController, ExtendedEditorUIOptions } from '@morfira-dev/wysiwyg/ui/extended';
import { createExtendedPreset } from '@morfira-dev/wysiwyg/presets/extended';

const checkExtendedUITypes = (host: HTMLElement, editor: Editor) => {
  const options: ExtendedEditorUIOptions = { density: 'compact', mentions: { locale: 'ru', labels: { label: 'People' } }, slash: { labels: { empty: 'No commands' } }, table: { rows: 3 } };
  const ui: ExtendedEditorUIController = createExtendedEditorUI(host, editor, options);
  ui.refresh();
  ui.destroy();
  const preset: EditorOptions = createExtendedPreset({ plugins: Object.freeze([]), schema: Object.freeze([]), mentions: { provide: () => [] }, slash: { provide: () => [] } });
  preset.plugins?.push({ name: 'app:mutable-result', setup: () => {} });
  // @ts-expect-error providers belong to behavior presets, not UI options
  createExtendedEditorUI(host, editor, { mentions: { provide: () => [] } });
  // @ts-expect-error menu locale is a supported language code
  createExtendedEditorUI(host, editor, { slash: { locale: 'de' } });
  // @ts-expect-error document lifecycle belongs to the editor
  ui.setHTML('<p>Wrong owner</p>');
};
void checkExtendedUITypes;
