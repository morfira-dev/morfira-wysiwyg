import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';

declare global {
  interface Window {
    feedbackForm: ImageFormController;
    feedbackOtherForm: ImageFormController;
    feedbackFormErrors: string[];
  }
}
