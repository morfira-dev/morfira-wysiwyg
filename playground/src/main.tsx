import { createEditor, createToolbar } from '@morfira-dev/wysiwyg';
import type { Editor, EditorChange } from '@morfira-dev/wysiwyg';
import { images, imageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import { tables, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import { createApp, h, ref } from 'vue';
import { MorfiraEditor as VueEditor } from '@morfira-dev/wysiwyg/vue';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MorfiraEditor as ReactEditor } from '@morfira-dev/wysiwyg/react';
import { mount, unmount } from 'svelte';
import SvelteHarness from './SvelteHarness.svelte';

declare global {
  interface Window { createEditor: typeof createEditor; createTables: typeof tables; createImages: typeof images; imageCommands: typeof imageCommands; editor: Editor; changes: EditorChange[]; dispose: () => void; tableCommands: typeof tableCommands; }
}
window.createEditor = createEditor;
window.createTables = tables; window.createImages = images; window.imageCommands = imageCommands;
window.changes = [];
window.tableCommands = tableCommands;
const ready = (editor: Editor) => { window.editor = editor; };
const change = (event: EditorChange) => window.changes.push(event);
const host = document.querySelector<HTMLElement>('#app')!;
const adapter = new URLSearchParams(location.search).get('adapter');
if (adapter === 'vue') {
  const app = createApp({
    setup: () => {
      const value = ref('<p>Initial content</p>');
      const readOnly = ref(false);
      return () => h('div', [
        h('button', { onClick: () => { value.value = '<p>External update</p>'; } }, 'Update value'),
        h('button', { onClick: () => { readOnly.value = !readOnly.value; } }, 'Toggle readonly'),
        h(VueEditor, { modelValue: value.value, 'onUpdate:modelValue': (next: string) => { value.value = next; }, readOnly: readOnly.value, onReady: ready, onChange: change }),
      ]);
    }
  });
  app.mount(host); window.dispose = () => app.unmount();
} else if (adapter === 'react') {
  const App = () => {
    const [value, setValue] = useState('<p>Initial content</p>');
    const [readOnly, setReadOnly] = useState(false);
    return <><button onClick={() => setValue('<p>External update</p>')}>Update value</button><button onClick={() => setReadOnly(!readOnly)}>Toggle readonly</button><ReactEditor value={value} readOnly={readOnly} onReady={ready} onChange={(event) => { setValue(event.html); change(event); }} /></>;
  };
  const root = createRoot(host); root.render(<StrictMode><App /></StrictMode>); window.dispose = () => root.unmount();
} else if (adapter === 'svelte') {
  const app = mount(SvelteHarness, { target: host, props: { onready: ready, onchange: change } });
  window.dispose = () => { void unmount(app); };
} else {
  host.innerHTML = '<div id="toolbar"></div><div id="editor"></div>';
  const editor = createEditor(host.querySelector('#editor')!, { value: '<h2>Лёгкий редактор. Большие возможности.</h2><p>Выделите текст, измените форматирование или добавьте таблицу.</p>', plugins: [tables()], onChange: change });
  ready(editor);
  const disposeToolbar = createToolbar(host.querySelector('#toolbar')!, editor);
  window.dispose = () => { disposeToolbar(); editor.destroy(); };
}
