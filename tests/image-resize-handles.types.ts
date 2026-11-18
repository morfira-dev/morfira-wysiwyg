import { createImageResizeUI } from '@morfira-dev/wysiwyg/ui/image-resize';
import type { ImageResizeUIController, ImageResizeUIOptions } from '@morfira-dev/wysiwyg/ui/image-resize';
import type { ImageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import type { Editor } from '@morfira-dev/wysiwyg';

declare global {
  interface Window {
    handlesResizeUI: ImageResizeUIController;
    handlesResizeAPI: ImageCommands;
    handlesResizeErrors: string[];
    handlesPointerId: number;
    handlesFocusExpected: string;
    handlesOtherEditor: Editor;
    handlesOtherUI: ImageResizeUIController;
    handlesOtherAPI: ImageCommands;
    handlesOtherChanges: number;
  }
}

const assertImageResizeUITypes = (host: HTMLElement, editor: Editor) => {
  const options: ImageResizeUIOptions = { label: 'Resize image', onError: (error) => { void error; } };
  const controller: ImageResizeUIController = createImageResizeUI(host, editor, options);
  controller.refresh();
  controller.destroy();
  // @ts-expect-error only the documented constructor options are accepted
  createImageResizeUI(host, editor, { pointer: true });
};
void assertImageResizeUITypes;
