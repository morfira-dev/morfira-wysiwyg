import { createContextualImageUI, contextualImageUIMessages } from '@morfira-dev/wysiwyg/ui/contextual-image';
import type { ContextualImageUIController, ContextualImageUIOptions, ContextualImageUIMessageKey } from '@morfira-dev/wysiwyg/ui/contextual-image';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { ImageCommands } from '@morfira-dev/wysiwyg/plugins/images';

declare global {
  interface Window {
    contextualImageUI: ContextualImageUIController;
    contextualImageAPI: ImageCommands;
  }
}

const checkContextualImageTypes = (host: HTMLElement, editor: Editor, key: ContextualImageUIMessageKey) => {
  const options: ContextualImageUIOptions = { gap: 6, label: contextualImageUIMessages.en[key], onError: (error: unknown) => { void error; } };
  const ui: ContextualImageUIController = createContextualImageUI(host, editor, options);
  const element: HTMLElement = ui.element;
  ui.refresh();
  ui.destroy();
  // @ts-expect-error the owned element cannot be replaced
  ui.element = element;
  // @ts-expect-error gap uses a number of CSS pixels
  createContextualImageUI(host, editor, { gap: '6px' });
  // @ts-expect-error image context does not provide a portal/node-view API
  createContextualImageUI(host, editor, { portal: document.body });
};
void checkContextualImageTypes;
