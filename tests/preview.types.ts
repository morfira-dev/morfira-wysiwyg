import { createPreviewUI, previewUIMessages } from '@morfira-dev/wysiwyg/ui/preview';
import type { PreviewUIController, PreviewUIMessageKey, PreviewUIOptions } from '@morfira-dev/wysiwyg/ui/preview';
import type { Editor } from '@morfira-dev/wysiwyg';

export interface PreviewTestOptions {
  value?: string;
  live?: boolean;
  images?: 'omit' | 'load';
}

declare global {
  interface Window {
    previewModule: typeof import('@morfira-dev/wysiwyg/ui/preview');
    previewUI: PreviewUIController;
    previewHost: HTMLElement;
    previewErrors: unknown[];
    previewErrorAction?: () => void;
  }
}

const checkPreviewTypes = (host: HTMLElement, editor: Editor, key: PreviewUIMessageKey) => {
  const options: PreviewUIOptions = { images: 'omit', live: false, label: previewUIMessages.en[key], onError: () => {} };
  const ui: PreviewUIController = createPreviewUI(host, editor, options);
  ui.open();
  ui.close();
  const toggled: boolean = ui.toggle();
  const opened: boolean = ui.isOpen();
  ui.refresh();
  ui.destroy();
  // @ts-expect-error preview does not expose HTML injection
  createPreviewUI(host, editor, { html: '<script>bad()</script>' });
  // @ts-expect-error image loading requires an explicit supported policy
  createPreviewUI(host, editor, { images: true });
  // @ts-expect-error the owned element reference is readonly
  ui.element = host;
  void [toggled, opened];
};
void checkPreviewTypes;
