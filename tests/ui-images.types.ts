import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';
import type { ImageValue } from '@morfira-dev/wysiwyg/plugins/images';

declare global {
  interface Window {
    imageForm: ImageFormController;
    imageFormSignals: AbortSignal[];
    imageFormCompleters: ((value: ImageValue) => void)[];
    imageFormFailures: string[];
    imageFormExternalAbort: AbortController;
    imageFormExternalOutcome?: boolean;
  }
}
