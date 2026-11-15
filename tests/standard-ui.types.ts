import type { Editor } from '@morfira-dev/wysiwyg';
import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard';
import type { StandardEditorUIController, StandardEditorUIOptions } from '@morfira-dev/wysiwyg/ui/standard';

const checkStandardUITypes = (host: HTMLElement, editor: Editor) => {
  const options: StandardEditorUIOptions = {
    density: 'compact',
    overflow: 'more',
    links: { initialValues: { href: 'https://example.com' } },
    images: { initialValues: { src: '/logo.svg', width: '64' } },
    search: { initialValues: { query: 'word', wholeWord: true } },
    table: { rows: 2, columns: 3 },
  };
  const ui: StandardEditorUIController = createStandardEditorUI(host, editor, options);
  ui.refresh();
  ui.destroy();
  // @ts-expect-error UI instances do not own document destruction or replacement
  ui.setHTML('<p>Wrong owner</p>');
  // @ts-expect-error no framework-specific size modes
  createStandardEditorUI(host, editor, { density: 'framework' });
  // @ts-expect-error image drafts use string values
  createStandardEditorUI(host, editor, { images: { initialValues: { width: 20 } } });
  // @ts-expect-error ready UI owns its conditional group priorities
  createStandardEditorUI(host, editor, { groupPriorities: [1] });
};
void checkStandardUITypes;
