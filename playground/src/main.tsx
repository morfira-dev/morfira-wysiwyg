import { createEditor, createToolbar, createPluginEvent } from '@morfira-dev/wysiwyg';
import type { Editor, EditorChange } from '@morfira-dev/wysiwyg';
import { mentions, mentionCommands } from '@morfira-dev/wysiwyg/plugins/mentions';
import { slash, slashCommands, createSlashActions } from '@morfira-dev/wysiwyg/plugins/slash';
import { createSuggestionMenu } from '@morfira-dev/wysiwyg/plugins/suggestions';
import type { SuggestionQuery } from '@morfira-dev/wysiwyg/plugins/mentions';
import { markdownShortcuts, markdownCommands } from '@morfira-dev/wysiwyg/plugins/markdown';
import { statistics, statisticsCommands } from '@morfira-dev/wysiwyg/plugins/statistics';
import { search, searchCommands } from '@morfira-dev/wysiwyg/plugins/search';
import { images, imageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import { tables, tableCommands } from '@morfira-dev/wysiwyg/plugins/tables';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/suggestions.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';
import { createApp, h, ref } from 'vue';
import { MorfiraEditor as VueEditor } from '@morfira-dev/wysiwyg/vue';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MorfiraEditor as ReactEditor } from '@morfira-dev/wysiwyg/react';
import { mount, unmount } from 'svelte';
import SvelteHarness from './SvelteHarness.svelte';

declare global {
  interface Window { createMentions: typeof mentions; mentionCommands: typeof mentionCommands; createSlash: typeof slash; createSlashActions: typeof createSlashActions; slashCommands: typeof slashCommands; createSuggestionMenu: typeof createSuggestionMenu; suggestionSignals: AbortSignal[]; suggestionQueries: string[]; createEditor: typeof createEditor; createPluginEvent: typeof createPluginEvent; createTables: typeof tables; createImages: typeof images; createSearch: typeof search; createStatistics: typeof statistics; createMarkdownShortcuts: typeof markdownShortcuts; markdownCommands: typeof markdownCommands; statisticsCommands: typeof statisticsCommands; searchCommands: typeof searchCommands; imageCommands: typeof imageCommands; editor: Editor; changes: EditorChange[]; dispose: () => void; tableCommands: typeof tableCommands; }
}
window.createEditor = createEditor; window.createPluginEvent = createPluginEvent; window.createMentions = mentions; window.mentionCommands = mentionCommands; window.createSlash = slash; window.createSlashActions = createSlashActions; window.slashCommands = slashCommands; window.createSuggestionMenu = createSuggestionMenu; window.suggestionSignals = []; window.suggestionQueries = [];
window.createTables = tables; window.createImages = images; window.createSearch = search; window.createStatistics = statistics; window.createMarkdownShortcuts = markdownShortcuts; window.markdownCommands = markdownCommands; window.statisticsCommands = statisticsCommands; window.searchCommands = searchCommands; window.imageCommands = imageCommands;
window.changes = [];
window.tableCommands = tableCommands;
const ready = (editor: Editor) => { window.editor = editor; };
const change = (event: EditorChange) => window.changes.push(event);
const host = document.querySelector<HTMLElement>('#app')!;
const adapter = new URLSearchParams(location.search).get('adapter');
const fixtureProvider = <T,>(items: T[]) => ({ query, signal }: SuggestionQuery): Promise<T[]> => new Promise((resolve) => {
  window.suggestionSignals.push(signal); window.suggestionQueries.push(query);
  const abort = () => { window.clearTimeout(timer); signal.removeEventListener('abort', abort); resolve([]); };
  const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(items); }, 100);
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});
const suggestionPlugins = new URLSearchParams(location.search).has('suggestions') ? [
  mentions({ provide: fixtureProvider([{ id: 'anna', label: 'Anna Smith' }, { id: 'boris', label: 'Борис' }]), debounceMs: 0 }),
  slash({ provide: fixtureProvider([{ id: 'signature', label: 'Signature', text: 'Best regards' }, { id: 'heading', label: 'Heading 2', action: 'heading2' }]), actions: createSlashActions(), debounceMs: 0 }),
] : [];

if (adapter === 'vue') {
  const app = createApp({
    setup: () => {
      const value = ref('<p>Initial content</p>');
      const readOnly = ref(false);
      return () => h('div', [
        h('button', { onClick: () => { value.value = '<p>External update</p>'; } }, 'Update value'),
        h('button', { onClick: () => { readOnly.value = !readOnly.value; } }, 'Toggle readonly'),
        h(VueEditor, { modelValue: value.value, 'onUpdate:modelValue': (next: string) => { value.value = next; }, readOnly: readOnly.value, plugins: suggestionPlugins, onReady: ready, onChange: change }),
      ]);
    }
  });
  app.mount(host); window.dispose = () => app.unmount();
} else if (adapter === 'react') {
  const App = () => {
    const [value, setValue] = useState('<p>Initial content</p>');
    const [readOnly, setReadOnly] = useState(false);
    return <><button onClick={() => setValue('<p>External update</p>')}>Update value</button><button onClick={() => setReadOnly(!readOnly)}>Toggle readonly</button><ReactEditor value={value} readOnly={readOnly} plugins={suggestionPlugins} onReady={ready} onChange={(event) => { setValue(event.html); change(event); }} /></>;
  };
  const root = createRoot(host); root.render(<StrictMode><App /></StrictMode>); window.dispose = () => root.unmount();
} else if (adapter === 'svelte') {
  const app = mount(SvelteHarness, { target: host, props: { onready: ready, onchange: change, plugins: suggestionPlugins } });
  window.dispose = () => { void unmount(app); };
} else {
  host.innerHTML = '<div id="toolbar"></div><div id="editor"></div>';
  const editor = createEditor(host.querySelector('#editor')!, { value: '<h2>Лёгкий редактор. Большие возможности.</h2><p>Выделите текст, измените форматирование или добавьте таблицу.</p>', plugins: [tables(), ...suggestionPlugins], onChange: change });
  ready(editor);
  const disposeToolbar = createToolbar(host.querySelector('#toolbar')!, editor);
  window.dispose = () => { disposeToolbar(); editor.destroy(); };
}
