import { createContextualLinkUI, contextualLinkUIMessages } from '@morfira-dev/wysiwyg/ui/contextual-link';
import type { ContextualLinkUIController, ContextualLinkUIOptions, ContextualLinkUIMessageKey } from '@morfira-dev/wysiwyg/ui/contextual-link';
import type { Editor } from '@morfira-dev/wysiwyg';

declare global { interface Window { contextualLinkUI: ContextualLinkUIController; } }

const checkContextualLinkTypes = (host: HTMLElement, editor: Editor, key: ContextualLinkUIMessageKey) => {
  const options: ContextualLinkUIOptions = { label: contextualLinkUIMessages.en[key], gap: 6, onError: (error: unknown) => { void error; } };
  const ui: ContextualLinkUIController = createContextualLinkUI(host, editor, options);
  const element: HTMLElement = ui.element;
  ui.refresh();
  ui.destroy();
  // @ts-expect-error the owned element cannot be replaced
  ui.element = element;
  // @ts-expect-error gap is supplied in CSS pixels as a number
  createContextualLinkUI(host, editor, { gap: '6px' });
  // @ts-expect-error navigation belongs to the validated native Open action
  createContextualLinkUI(host, editor, { openURL: () => {} });
};

void checkContextualLinkTypes;
