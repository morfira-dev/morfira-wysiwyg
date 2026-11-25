import type { createEditor } from '@morfira-dev/wysiwyg';
import type { createContentView } from '@morfira-dev/wysiwyg/content-view';
import type { createApplicationExtensions } from '../../apps/docs/.vitepress/theme/application-extensions/index.js';

declare global {
  interface Window {
    applicationExtensionFixture: {
      createEditor: typeof createEditor;
      createContentView: typeof createContentView;
      createApplicationExtensions: typeof createApplicationExtensions;
    };
  }
}
