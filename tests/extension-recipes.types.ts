import type { Editor } from '@morfira-dev/wysiwyg';

export interface RecipeAdapterProbe {
  editor?: Editor;
  instances: Editor[];
  retained?: HTMLElement;
  unmount(): void;
}
declare global {
  interface Window {
    recipeUploadAbort?: AbortController;
    recipeAdapterProbe: RecipeAdapterProbe;
  }
}
