import { defineMorfiraEditor } from '@morfira-dev/wysiwyg/web-component';
import { createRecipeBundle } from '../index.js';
import { createLocalRecipeServices } from '../local-services.js';

/** Call only in the browser; registration stays explicit, never at import time. */
export const mountRecipeElement = (host: HTMLElement): (() => void) => {
  if (!host.isConnected || host.childNodes.length) throw new TypeError('Expected an empty connected host.');
  const Element = defineMorfiraEditor('morfira-recipe-editor');
  const element = new Element();
  element.plugins = createRecipeBundle(createLocalRecipeServices().options).plugins;
  element.value = '<p>Recipe editor</p>';
  element.label = 'Recipe editor';
  host.append(element);
  return () => element.remove();
};
