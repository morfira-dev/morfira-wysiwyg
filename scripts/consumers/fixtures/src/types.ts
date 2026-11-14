import type { Editor } from '@morfira-dev/wysiwyg';

export interface ConsumerProbe {
  editor?: Editor;
  changes: number;
}
declare global {
  interface Window {
    morfiraConsumer: ConsumerProbe;
  }
}
