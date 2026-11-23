import { useMemo, useState } from 'react';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/react';
import type { Editor } from '@morfira-dev/wysiwyg';
import { createRecipeBundle } from '../index.js';
import { createLocalRecipeServices } from '../local-services.js';

/** Mount under React.StrictMode; each adapter mount owns plugin setup/cleanup. */
export const RecipeReact = ({ onReady }: { onReady?: (editor: Editor) => void }) => {
  const [value, setValue] = useState('<p>Recipe editor</p>');
  const bundle = useMemo(() => createRecipeBundle(createLocalRecipeServices().options), []);
  return <MorfiraEditor value={value} plugins={bundle.plugins} label="Recipe editor" onReady={onReady} onChange={(change) => setValue(change.html)} />;
};
