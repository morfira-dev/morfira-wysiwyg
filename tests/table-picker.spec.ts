import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TablePickerTestState } from './table-picker.types.js';

const initialize = async (page: Page, rows = 3, columns = 3) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ rows, columns }) => {
    window.dispose();
    const uiHost = document.createElement('div');
    uiHost.className = 'picker-ui';
    const editorHost = document.createElement('div');
    editorHost.className = 'picker-editor';
    document.body.append(uiHost, editorHost);
    window.editor = window.createEditor(editorHost, {
      value: '<p>AB</p>', locale: 'en',
      plugins: [window.createTables(), window.createImages(), window.createSearch()],
    });
    window.editor.setSelection(1);
    const uiPath = '/packages/plugins/dist/ui/standard.js';
    const pickerPath = '/packages/plugins/dist/ui/table-picker.js';
    const { createStandardEditorUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/standard');
    const { createTablePicker } = await import(/* @vite-ignore */ pickerPath) as typeof import('@morfira-dev/wysiwyg/ui/table-picker');
    const state = {} as TablePickerTestState;
    state.ui = createStandardEditorUI(uiHost, window.editor, {
      table: { rows, columns, picker: (host, options) => {
        state.select = options.onSelect;
        state.picker = createTablePicker(host, options);
        return state.picker;
      } },
    });
    window.editor.providePlugin('test-picker', state);
    window.dispose = () => { state.ui.destroy(); window.editor.destroy(); };
  }, { rows, columns });
};
const tools = (page: Page) => page.locator('.picker-ui');
const launcher = (page: Page) => tools(page).locator('[data-mw-ui-action="table"]');
const chooser = (page: Page) => tools(page).locator('.mw-table-picker');
const content = (page: Page) => page.locator('.picker-editor .mw-content');

test('pointer preview stays outside history and commits a chosen size in one undoable insertion', async ({ page }) => {
  await initialize(page);
  await launcher(page).click();
  const cell = chooser(page).getByRole('button', { name: 'Insert table: 2 × 3', exact: true });
  await cell.hover();
  await expect(chooser(page).getByRole('status')).toHaveText('2 × 3');
  await expect(chooser(page).locator('.mw-table-picker-selected')).toHaveCount(6);
  await expect(tools(page).getByLabel('Table rows', { exact: true })).toHaveValue('3');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await cell.click();
  await expect(content(page).locator('tr')).toHaveCount(2);
  await expect(content(page).locator('td')).toHaveCount(6);
  await expect(tools(page).locator('.mw-ui-panel')).toBeHidden();
  await expect(content(page)).toBeFocused();
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AB</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('keyboard uses one roving stop, bounded arrows and Home/End, with Escape and native Space activation', async ({ page }) => {
  await initialize(page);
  await launcher(page).focus();
  await page.keyboard.press('Enter');
  await expect(chooser(page).getByRole('button', { name: 'Insert table: 3 × 3', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await expect(chooser(page).getByRole('status')).toHaveText('2 × 2');
  await page.keyboard.press('End');
  await expect(chooser(page).getByRole('status')).toHaveText('2 × 8');
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  await expect(chooser(page).getByRole('status')).toHaveText('1 × 1');
  await page.keyboard.press('Control+End');
  await expect(chooser(page).getByRole('status')).toHaveText('8 × 8');
  await expect(chooser(page).locator('[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(launcher(page)).toBeFocused();
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(content(page).locator('td')).toHaveCount(2);
});

test('numeric fields retain their 1–100 range and independent drafts while the quick preview stays bounded', async ({ page }) => {
  await initialize(page, 99, 100);
  await launcher(page).click();
  await expect(chooser(page).getByRole('button')).toHaveCount(64);
  await expect(chooser(page).getByRole('status')).toHaveText('8 × 8');
  await expect(tools(page).getByLabel('Table rows', { exact: true })).toHaveValue('99');
  await expect(tools(page).getByLabel('Table columns', { exact: true })).toHaveValue('100');
  await tools(page).getByLabel('Table rows', { exact: true }).fill('2');
  await tools(page).getByLabel('Table columns', { exact: true }).fill('9');
  await chooser(page).getByRole('button', { name: 'Insert table: 1 × 1', exact: true }).hover();
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(tools(page).getByLabel('Строки таблицы', { exact: true })).toHaveValue('2');
  await expect(tools(page).getByLabel('Столбцы таблицы', { exact: true })).toHaveValue('9');
  await tools(page).getByLabel('Столбцы таблицы', { exact: true }).press('Enter');
  await expect(content(page).locator('td')).toHaveCount(18);
});

test('localized literal labels, read-only and IME guards never turn preview or synthetic activation into edits', async ({ page }) => {
  await initialize(page);
  await launcher(page).click();
  await page.evaluate(() => window.editor.setLocale('ru-RU', { 'ui.tablePicker.insert': '<img src=x onerror=alert(1)>' }));
  await expect(chooser(page)).toHaveAccessibleName('Размер таблицы');
  await expect(chooser(page).getByRole('button').first()).toHaveAccessibleName('<img src=x onerror=alert(1)>: 1 × 1');
  await expect(chooser(page).locator('img')).toHaveCount(0);
  const before = await chooser(page).getByRole('status').textContent();
  await chooser(page).locator('[tabindex="0"]').evaluate((button) => {
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', isComposing: true, bubbles: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
  });
  await expect(chooser(page).getByRole('status')).toHaveText(before!);
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    document.querySelector('.mw-table-picker-cell')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.editor.getPlugin<TablePickerTestState>('test-picker')!.select!(2, 2);
  });
  await expect(chooser(page).getByRole('button').first()).toBeDisabled();
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AB</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('focus callbacks and API replacement invalidate insert authority and retained picker callbacks stay inert', async ({ page }) => {
  await initialize(page);
  await launcher(page).click();
  await page.evaluate(() => {
    window.editor.surface.addEventListener('focus', () => window.editor.setReadOnly(true), { once: true });
    window.editor.getPlugin<TablePickerTestState>('test-picker')!.select!(2, 2);
  });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AB</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  const result = await page.evaluate(() => {
    const state = window.editor.getPlugin<TablePickerTestState>('test-picker')!;
    const retained = state.picker!.element.querySelector('button')!;
    window.editor.setReadOnly(false);
    window.editor.setHTML('<p>Replacement</p>');
    state.select!(2, 2);
    retained.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    state.ui.destroy();
    state.select!(3, 3);
    return { html: window.editor.getHTML(), undo: window.editor.canUndo(), attached: state.picker!.element.isConnected };
  });
  expect(result).toEqual({ html: '<p>Replacement</p>', undo: false, attached: false });
});

test('standalone widgets validate atomically, keep independent state and release detached controls', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/table-picker.js';
    const { createTablePicker } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/table-picker');
    const hosts = [document.createElement('div'), document.createElement('div')];
    document.body.append(...hosts);
    const calls: number[][] = [];
    const options = { rows: 2, columns: 3, locale: { locale: 'en', translations: { 'ui.tablePicker.insert': 'Choose' } }, disabled: false, onSelect: (r: number, c: number) => { calls.push([r, c]); } };
    let invalid = false;
    try { createTablePicker(hosts[0], { ...options, rows: 101 }); } catch { invalid = hosts[0].childNodes.length === 0; }
    const first = createTablePicker(hosts[0], options);
    const second = createTablePicker(hosts[1], { ...options, rows: 1, columns: 1 });
    const retained = first.element.querySelector<HTMLButtonElement>('button')!;
    options.locale.translations['ui.tablePicker.insert'] = 'Mutated caller copy';
    retained.focus();
    const copiedLabel = retained.getAttribute('aria-label');
    let refreshRejected = false;
    try { first.refresh({ locale: { locale: '', translations: {} }, disabled: true }); } catch { refreshRejected = !retained.disabled; }
    let translationsRejected = false;
    try { first.refresh({ locale: { locale: 'en', translations: Object.create({ inherited: 'Invalid' }) }, disabled: true }); } catch { translationsRejected = !retained.disabled; }
    const secondPreview = second.element.querySelector('[role="status"]')!.textContent;
    first.destroy();
    first.destroy();
    hosts[0].append(first.element);
    retained.click();
    first.element.remove();
    let destroyed = false;
    try { first.refresh({ locale: options.locale, disabled: false }); } catch { destroyed = true; }
    second.element.querySelector<HTMLButtonElement>('button')!.click();
    second.destroy();
    hosts.forEach((host) => host.remove());
    return { invalid, refreshRejected, translationsRejected, copiedLabel, secondPreview, destroyed, calls };
  });
  expect(result).toEqual({ invalid: true, refreshRejected: true, translationsRejected: true, copiedLabel: 'Choose: 1 × 1', secondPreview: '1 × 1', destroyed: true, calls: [[1, 1]] });
});

test('the selective picker imports on the server without browser globals', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', "import { createTablePicker } from '@morfira-dev/wysiwyg/ui/table-picker'; console.log(typeof createTablePicker, typeof document, typeof customElements)"], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  expect(output).toBe('function undefined undefined');
});
