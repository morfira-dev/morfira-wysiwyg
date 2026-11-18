import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';

declare global {
  interface Window {
    alignmentImageForm: ImageFormController;
    alignmentImageErrors: string[];
  }
}
