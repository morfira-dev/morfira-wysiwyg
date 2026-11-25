import type { createContentView } from '@morfira-dev/wysiwyg/content-view';
import type { createDocumentSchema } from '@morfira-dev/wysiwyg';

declare global {
  interface Window {
    createContentView: typeof createContentView;
    createDocumentSchema: typeof createDocumentSchema;
  }
}
