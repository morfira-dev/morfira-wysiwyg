import type { InlineNodeViewsController } from '@morfira-dev/wysiwyg/sdk';
export interface InlineViewProbe {
  controller: InlineNodeViewsController;
  errors: number;
}
declare global {
  interface Window {
    inlineViewProbe: InlineViewProbe;
  }
}
