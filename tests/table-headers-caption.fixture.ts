import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import './table-headers-caption.types.js';

export const headerTableSample = '<table title="Headers"><tbody><tr><td title="A" style="color:navy"><p><strong>Alpha</strong></p></td><td title="B"><p>Beta</p></td><td title="C"><p>Gamma</p></td></tr><tr><td title="D"><p>Delta</p></td><td title="E"><p>Echo</p></td><td title="F"><p>Foxtrot</p></td></tr><tr><td title="G"><p>Golf</p></td><td title="H"><p>Hotel</p></td><td title="I"><p>India</p></td></tr></tbody></table><p>After</p>';

export const initializeTableHeaders = async (page: Page, value = headerTableSample, form = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, form }) => {
    window.dispose();
    const pluginPath = '/packages/plugins/dist/table-properties.js';
    const tablesPath = '/packages/plugins/dist/tables.js';
    const { tableProperties, tablePropertyCommands } = await import(/* @vite-ignore */ pluginPath) as typeof import('@morfira-dev/wysiwyg/plugins/table-properties');
    const { getTableSelection } = await import(/* @vite-ignore */ tablesPath) as typeof import('@morfira-dev/wysiwyg/plugins/tables');
    const host = document.createElement('div');
    host.className = 'headers-editor';
    const tools = document.createElement('div');
    tools.className = 'headers-tools';
    document.body.replaceChildren(host, tools);
    window.changes = [];
    window.headerFormErrors = [];
    window.editor = window.createEditor(host, { value, locale: 'en', plugins: [window.createTables(), tableProperties()], onChange: (change) => window.changes.push(change) });
    window.headerProperties = tablePropertyCommands(window.editor);
    window.headerTables = window.tableCommands(window.editor);
    window.headerSelection = () => getTableSelection(window.editor);
    const cell = window.editor.surface.querySelector('td p,th p,td,th')!;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    window.editor.surface.focus();
    const native = document.getSelection()!;
    native.removeAllRanges();
    native.addRange(range);
    if (form) {
      const formPath = '/packages/plugins/dist/ui/table-properties.js';
      const { createTablePropertiesForm } = await import(/* @vite-ignore */ formPath) as typeof import('@morfira-dev/wysiwyg/ui/table-properties');
      window.headerForm = createTablePropertiesForm(tools, window.editor, { onError: (error) => { window.headerFormErrors.push(String(error)); } });
    }
    window.dispose = () => { if (form) window.headerForm.destroy(); window.editor.destroy(); host.remove(); tools.remove(); };
  }, { value, form });
};
