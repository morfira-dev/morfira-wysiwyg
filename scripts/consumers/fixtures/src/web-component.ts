import { defineMorfiraEditor } from '@morfira-dev/wysiwyg/web-component';
import type { Editor, EditorChange } from '@morfira-dev/wysiwyg';
import { changed, plugins, ready } from './common.js';

const Constructor = defineMorfiraEditor();
const element = new Constructor();
element.value = '<p>Initial</p>';
element.locale = 'en';
element.label = 'Consumer editor';
element.plugins = plugins;
element.addEventListener('ready', (event) => ready((event as CustomEvent<Editor>).detail));
element.addEventListener('value-change', (event) => { element.value = (event as CustomEvent<string>).detail; });
element.addEventListener('change', (event) => changed((event as CustomEvent<EditorChange>).detail));
const host = document.getElementById('app')!;
let external = 0;
for (const [action, callback] of [
  ['external', () => { element.value = `<p>External ${++external}</p>`; }],
  ['readonly', () => { element.readOnly = !element.readOnly; }],
  ['locale-ru', () => { element.locale = 'ru'; }],
  ['locale-en', () => { element.locale = 'en'; }],
  ['unmount', () => element.remove()],
] as const) {
  const button = document.createElement('button');
  button.dataset.action = action;
  button.textContent = action;
  button.addEventListener('click', callback);
  host.append(button);
}
host.append(element);
