import type { CodeHighlightProvider } from '@morfira-dev/wysiwyg/ui/code-blocks';
import type { RecipeHighlightLoader, RecipeHighlightModule } from './types.js';

/** Loading is triggered by first use; the application chooses the module/grammar. */
export const createLazyHighlight = (load: RecipeHighlightLoader): CodeHighlightProvider => {
  let loading: Promise<RecipeHighlightModule> | undefined;
  return async (request) => {
    request.signal.throwIfAborted();
    loading ??= Promise.resolve().then(load).catch((error: unknown) => { loading = undefined; throw error; });
    const module = await loading;
    request.signal.throwIfAborted();
    if (!module || typeof module.highlight !== 'function') { loading = undefined; throw new TypeError('Expected a highlight provider module.'); }
    const result = await module.highlight(request);
    request.signal.throwIfAborted();
    return result;
  };
};
