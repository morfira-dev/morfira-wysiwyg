import { createContextualTableUI, contextualTableUIMessages } from '@morfira-dev/wysiwyg/ui/contextual-table';
import type { ContextualTableUIController, ContextualTableUIOptions, ContextualTableUIMessageKey } from '@morfira-dev/wysiwyg/ui/contextual-table';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { TableCommands } from '@morfira-dev/wysiwyg/plugins/tables';

declare global {
  interface Window {
    contextualTableUI: ContextualTableUIController;
    contextualTableAPI: TableCommands;
  }
}

const checkContextualTableTypes = (host: HTMLElement, editor: Editor, key: ContextualTableUIMessageKey) => {
  const options: ContextualTableUIOptions = { gap: 6, label: contextualTableUIMessages.en[key], onError: (error: unknown) => { void error; } };
  const ui: ContextualTableUIController = createContextualTableUI(host, editor, options);
  const element: HTMLElement = ui.element;
  ui.refresh();
  ui.destroy();
  // @ts-expect-error the owned element cannot be replaced
  ui.element = element;
  // @ts-expect-error gap uses a finite number of CSS pixels
  createContextualTableUI(host, editor, { gap: '6px' });
  // @ts-expect-error contextual table UI owns no plugin mutation extension point
  createContextualTableUI(host, editor, { execute: () => undefined });
};
void checkContextualTableTypes;
