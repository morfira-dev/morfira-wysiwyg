import { defineMorfiraEditor } from '@morfira-dev/wysiwyg/web-component';
import type { Editor, EditorChange } from '@morfira-dev/wysiwyg';
import { tables } from '@morfira-dev/wysiwyg/plugins/tables';
import type { WebComponentHarness } from './types.js';
import '@morfira-dev/wysiwyg/style.css';
import '@morfira-dev/wysiwyg/plugins/tables.css';

declare global {
  interface Window { webComponentHarness: WebComponentHarness; }
}

const Constructor = defineMorfiraEditor();
const element = new Constructor();
element.value = '<p>Initial content</p>';
element.locale = 'en';
element.plugins = [tables()];
window.changes = [];
const harness: WebComponentHarness = { define: defineMorfiraEditor, element, values: [], ready: 0 };
window.webComponentHarness = harness;
element.addEventListener('ready', (event) => {
  window.editor = (event as CustomEvent<Editor>).detail;
  harness.ready++;
});
element.addEventListener('value-change', (event) => {
  const value = (event as CustomEvent<string>).detail;
  harness.values.push(value);
  element.value = value;
});
element.addEventListener('change', (event) => window.changes.push((event as CustomEvent<EditorChange>).detail));
document.getElementById('app')!.append(element);
const action = (name: string, callback: () => void) => document.querySelector(`[data-action="${name}"]`)!.addEventListener('click', callback);
action('external', () => { element.value = '<p>External update</p>'; });
action('readonly', () => { element.readOnly = !element.readOnly; });
action('locale', () => { element.locale = element.locale === 'en' ? 'ru' : 'en'; });
action('unmount', () => element.remove());
action('remount', () => document.getElementById('app')!.append(element));
window.dispose = () => element.remove();
