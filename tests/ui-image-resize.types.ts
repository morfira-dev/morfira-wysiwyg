import type { ImageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import type { ImageFormController, ImageFormOptions } from '@morfira-dev/wysiwyg/ui/images';

declare global {
  interface Window {
    imageResizeForm: ImageFormController;
    imageResizeFormAPI: ImageCommands;
    imageResizeFormOptions: ImageFormOptions;
    imageResizeFormErrors: string[];
  }
}
