import type { ImageCommands, ImageOptions, ImageUploadContext, ImageUploadProgress, ImageValue } from '@morfira-dev/wysiwyg/plugins/images';

export interface FeedbackAttempt {
  context: ImageUploadContext;
  file: File;
  finish: (value: ImageValue) => void;
  fail: (error: unknown) => void;
}

declare global {
  interface Window {
    feedbackAPI: ImageCommands;
    feedbackAttempts: FeedbackAttempt[];
    feedbackReports: ImageUploadProgress[];
    feedbackOutcome: Promise<string>;
  }
}

const assertUploadFeedbackTypes = (api: ImageCommands) => {
  const options: ImageOptions = { upload: async (_file, { signal, reportProgress }) => {
    if (!signal.aborted) reportProgress({ loaded: 3, total: 10 });
    return { src: '/logo.svg' };
  } };
  void options;
  void api.upload(new File(['png'], 'image.png'), { onProgress: (progress: ImageUploadProgress) => { void progress.loaded; } });
  // @ts-expect-error progress loaded is numeric bytes
  const invalid: ImageUploadProgress = { loaded: '3' };
  void invalid;
};
void assertUploadFeedbackTypes;
