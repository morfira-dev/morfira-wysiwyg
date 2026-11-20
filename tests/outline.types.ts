import { createOutlineUI, outlineUIMessages } from '@morfira-dev/wysiwyg/ui/outline';
import type { OutlineUIController, OutlineUIMessageKey, OutlineUIOptions } from '@morfira-dev/wysiwyg/ui/outline';
import type { Editor } from '@morfira-dev/wysiwyg';

export interface OutlineTestOptions {
  value?: string;
  maxHeadings?: number;
  label?: string;
}

declare global {
  interface Window {
    outlineModule: typeof import('@morfira-dev/wysiwyg/ui/outline');
    outlineUI: OutlineUIController;
    outlineHost: HTMLElement;
    outlineErrors: unknown[];
    outlineErrorAction?: () => void;
  }
}

const checkOutlineTypes = (host: HTMLElement, editor: Editor, key: OutlineUIMessageKey) => {
  const options: OutlineUIOptions = { label: outlineUIMessages.en[key], maxHeadings: 40, onError: () => {} };
  const ui: OutlineUIController = createOutlineUI(host, editor, options);
  ui.refresh();
  ui.destroy();
  // @ts-expect-error outline does not accept arbitrary markup
  createOutlineUI(host, editor, { html: '<a>Injected</a>' });
  // @ts-expect-error navigation is by native controls, not mutable index commands
  ui.navigate(0);
  // @ts-expect-error explicit numeric limit only
  createOutlineUI(host, editor, { maxHeadings: 'all' });
  // @ts-expect-error owned element cannot be reassigned
  ui.element = host;
};
void checkOutlineTypes;
