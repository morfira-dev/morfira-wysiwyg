import type { ImageValue } from '@morfira-dev/wysiwyg/plugins/images';
import type { ImageInputOptions } from '@morfira-dev/wysiwyg/plugins/image-input';

declare global {
  interface Window {
    inputImageResults: Array<(value: ImageValue) => void>;
    inputImageFailures: Array<(error: Error) => void>;
    inputImageSignals: AbortSignal[];
    inputImageErrors: string[];
  }
}

const options: ImageInputOptions = { onError: (error: unknown) => { void error; } };
void options;
