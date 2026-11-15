import { createImageForm } from '@morfira-dev/wysiwyg/ui/images';
import type { ImageFormController, ImageFormMode, ImageFormOptions } from '@morfira-dev/wysiwyg/ui/images';
import type { ImageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import type { Editor } from '@morfira-dev/wysiwyg';

declare global {
  interface Window {
    imageEditForm: ImageFormController;
    imageEditOptions: ImageFormOptions;
    imageEditAPI: ImageCommands;
    imageEditUploads: number;
  }
}
const assertImageEditTypes = (host: HTMLElement, editor: Editor) => {
  const mode: ImageFormMode = 'edit';
  const options: ImageFormOptions = { mode, initialValues: { alt: 'Draft' } };
  const form: ImageFormController = createImageForm(host, editor, options);
  form.refresh();
  form.destroy();
  // @ts-expect-error image mode is a closed additive choice
  createImageForm(host, editor, { mode: 'insert' });
};
void assertImageEditTypes;
