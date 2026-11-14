import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MorfiraEditor } from '@morfira-dev/wysiwyg/react';
import { plugins, ready, changed } from './common.js';
import type { EditorChange } from '@morfira-dev/wysiwyg';

const App = () => {
  const [value, setValue] = useState('<p>Initial</p>');
  const [readOnly, setReadOnly] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [external, setExternal] = useState(0);
  const replace = () => {
    const next = external + 1;
    setExternal(next);
    setValue(`<p>External ${next}</p>`);
  };
  const change = (event: EditorChange) => { setValue(event.html); changed(event); };
  return <>
    <button data-action="external" onClick={replace}>External value</button>
    <button data-action="readonly" onClick={() => setReadOnly(!readOnly)}>Read only</button>
    <button data-action="unmount" onClick={() => setMounted(false)}>Unmount</button>
    {mounted && <MorfiraEditor value={value} readOnly={readOnly} plugins={plugins} locale="en" label="Consumer editor" onReady={ready} onChange={change} />}
  </>;
};
createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>);
