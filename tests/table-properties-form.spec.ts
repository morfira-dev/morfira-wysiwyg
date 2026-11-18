import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TablePropertiesFormTestOptions } from './table-properties-form.types.js';

const sample = '<table title="Owner" width="500" style="width: 55%"><tbody><tr><td title="A" rowspan="2" style="background-color: #112233; vertical-align: top"><p><strong>Alpha</strong></p></td><td title="B" style="background-color: #445566; vertical-align: bottom"><p><em>Beta</em></p></td><td title="Keep"><p>Keep</p></td></tr><tr><td title="C" style="background-color: #445566; vertical-align: bottom"><p>Charlie</p></td><td><p>Other</p></td></tr></tbody></table><p>Between</p><table title="Other"><tbody><tr><td><p>Second table</p></td></tr></tbody></table>';
const tools = (page: Page) => page.locator('.property-form-host');
const content = (page: Page) => page.locator('.property-form-editor .mw-content');
const field = (page: Page, name: string) => tools(page).locator(`[data-mw-table-property="${name}"]`);
const apply = (page: Page) => tools(page).getByRole('button', { name: 'Apply properties', exact: true });
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

const initialize = async (page: Page, options: TablePropertiesFormTestOptions = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ sample, options }) => {
    window.dispose();
    const pluginPath = '/packages/plugins/dist/table-properties.js';
    const formPath = '/packages/plugins/dist/ui/table-properties.js';
    const { tableProperties, tablePropertyCommands } = await import(/* @vite-ignore */ pluginPath) as typeof import('@morfira-dev/wysiwyg/plugins/table-properties');
    const { createTablePropertiesForm } = await import(/* @vite-ignore */ formPath) as typeof import('@morfira-dev/wysiwyg/ui/table-properties');
    const editorHost = document.createElement('div');
    editorHost.className = 'property-form-editor';
    const formHost = document.createElement('div');
    formHost.className = 'property-form-host';
    document.body.prepend(editorHost, formHost);
    window.changes = [];
    window.propertyFormErrors = [];
    window.editor = window.createEditor(editorHost, {
      label: 'Properties editor', locale: 'en', value: sample,
      plugins: [window.createTables(), tableProperties()],
      onChange: (change) => window.changes.push(change),
    });
    window.propertyFormFactory = createTablePropertiesForm;
    window.propertyFormCommands = tablePropertyCommands(window.editor);
    const table = window.editor.surface.querySelector('table[title="Owner"]')!;
    window.propertyFormOriginalNodes = [table, ...table.querySelectorAll('*')];
    const text = window.editor.surface.querySelector('[title="A"] strong')!.firstChild!;
    window.editor.surface.focus();
    const selection = document.getSelection()!;
    if (options.backward) selection.setBaseAndExtent(text, 4, text, 1);
    else selection.setBaseAndExtent(text, 1, text, 1);
    if (options.logical !== false) window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 0, column: 1 });
    window.propertyForm = createTablePropertiesForm(formHost, window.editor, {
      onError: (error) => {
        window.propertyFormErrors.push(String(error));
        if (options.rejectErrors) return Promise.reject(new Error('Presentation failed'));
      },
    });
    window.dispose = () => {
      window.propertyForm.destroy();
      window.editor.destroy();
      window.propertyFormSecond?.destroy();
      window.propertyFormSecondEditor?.destroy();
      editorHost.remove();
      formHost.remove();
    };
  }, { sample, options });
  await expect(field(page, 'width')).toHaveValue('55%');
};

const focusFirstCell = (page: Page) => page.evaluate(() => {
  const text = window.editor.surface.querySelector('[title="A"] strong')!.firstChild!;
  window.editor.surface.focus();
  document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
  window.propertyForm.refresh();
});

test('dirty table fields apply atomically without overwriting mixed merged-cell styles and restore backward selection in Undo', async ({ page }) => {
  await initialize(page, { backward: true });
  const before = await html(page);
  const originalColors = await content(page).locator('[title="Owner"] td').evaluateAll((cells) => cells.map((cell) => (cell as HTMLElement).style.backgroundColor));
  await expect(field(page, 'cellBackground')).toHaveAttribute('placeholder', 'Mixed values');
  await field(page, 'width').fill('60%');
  await field(page, 'alignment').selectOption('center');
  await apply(page).click();
  expect(await page.evaluate(() => {
    const table = window.editor.surface.querySelector<HTMLTableElement>('table[title="Owner"]')!;
    const text = table.querySelector('strong')!.firstChild!;
    const selection = document.getSelection()!;
    return { width: table.style.width, left: table.style.marginLeft, right: table.style.marginRight, legacy: table.hasAttribute('width'), selection: selection.anchorNode === text && selection.anchorOffset === 4 && selection.focusNode === text && selection.focusOffset === 1, retained: window.propertyFormOriginalNodes.every((node) => node.isConnected && window.editor.surface.contains(node)), changes: window.changes.map((change) => change.source) };
  })).toEqual({ width: '60%', left: 'auto', right: 'auto', legacy: false, selection: true, retained: true, changes: ['user'] });
  expect(await content(page).locator('[title="Owner"] td').evaluateAll((cells) => cells.map((cell) => (cell as HTMLElement).style.backgroundColor))).toEqual(originalColors);
  await expect(content(page).locator('[title="Keep"]')).toHaveText('Keep');
  await expect(content(page).locator('strong')).toHaveText('Alpha');
  await expect(apply(page)).toBeDisabled();
  const changed = await html(page);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    const selection = document.getSelection()!;
    return selection.anchorNode === text && selection.anchorOffset === 4 && selection.focusNode === text && selection.focusOffset === 1;
  })).toBe(true);
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(changed);
});

test('mixed controls and drafts survive locale changes with literal overrides and independent value snapshots', async ({ page }) => {
  await initialize(page);
  await field(page, 'width').fill('72%');
  expect(await page.evaluate(() => {
    const values = window.propertyForm.getValues();
    values.width = '99%';
    window.editor.setLocale('ru', { 'ui.tableProperties.label': '<img src=x onerror=alert(1)>', 'ui.tableProperties.width': 'Буквальная ширина' });
    return window.propertyForm.getValues().width;
  })).toBe('72%');
  await expect(tools(page).getByRole('form', { name: '<img src=x onerror=alert(1)>', exact: true })).toBeVisible();
  await expect(field(page, 'width')).toHaveAccessibleName('Буквальная ширина');
  await expect(field(page, 'cellBackground')).toHaveAttribute('placeholder', 'Разные значения');
  await expect(field(page, 'width')).toHaveValue('72%');
  await expect(tools(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.propertyForm.getValues().cellVerticalAlign)).toBe('');
  await expect(field(page, 'cellVerticalAlign').getByRole('option', { name: 'По умолчанию', exact: true })).toBeEnabled();
  await field(page, 'cellVerticalAlign').selectOption({ label: 'По умолчанию' });
  await tools(page).getByRole('button', { name: 'Применить свойства', exact: true }).click();
  await expect(tools(page).getByRole('status')).toHaveText('Свойства применены.');
  expect(await page.evaluate(() => window.editor.surface.querySelector<HTMLTableElement>('table')!.style.width)).toBe('72%');
  expect(await page.evaluate(() => window.propertyFormCommands.getState().cellBackground)).toBe('mixed');
  expect(await page.evaluate(() => window.propertyFormCommands.getState().cellVerticalAlign)).toBe(false);
  expect(await content(page).locator('[title="A"],[title="B"],[title="C"]').evaluateAll((cells) => cells.every((cell) => !(cell as HTMLElement).style.verticalAlign))).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
});

test('focus callbacks cannot redirect a draft to another table or replacement document', async ({ page }) => {
  await initialize(page, { logical: false });
  const before = await html(page);
  await field(page, 'width').fill('80%');
  await page.evaluate(() => window.editor.surface.addEventListener('focus', () => {
    const text = window.editor.surface.querySelector('table[title="Other"] p')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
  }, { once: true }));
  await apply(page).click();
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await focusFirstCell(page);
  await field(page, 'width').fill('80%');
  await page.evaluate(() => window.editor.surface.addEventListener('focus', () => {
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setHTML('<table title="Replacement"><tbody><tr><td><p>Replacement</p></td></tr></tbody></table>');
  }, { once: true }));
  await apply(page).click();
  await expect(content(page).locator('table')).toHaveAttribute('title', 'Replacement');
  expect(await page.evaluate(() => window.editor.surface.querySelector<HTMLTableElement>('table')!.style.width)).toBe('');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await expect(apply(page)).toBeDisabled();
  const replacement = await html(page);
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('table[title="Replacement"] p')!.firstChild!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    window.propertyForm.refresh();
  });
  await expect(field(page, 'width')).toBeEnabled();
  await field(page, 'width').fill('64%');
  await apply(page).click();
  expect(await page.evaluate(() => window.editor.surface.querySelector<HTMLTableElement>('table')!.style.width)).toBe('64%');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(replacement);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await initialize(page, { logical: false });
  const resumed = await html(page);
  await field(page, 'width').fill('80%');
  await page.evaluate(() => window.editor.surface.addEventListener('focus', () => {
    window.editor.setReadOnly(true);
    window.editor.setReadOnly(false);
  }, { once: true }));
  await apply(page).click();
  expect(await html(page)).toBe(resumed);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await focusFirstCell(page);
  await field(page, 'width').fill('82%');
  await page.evaluate(() => window.editor.surface.addEventListener('focus', () => window.editor.destroy(), { once: true }));
  await apply(page).click();
  await expect(tools(page).locator('.mw-table-properties-form')).toHaveCount(0);
  expect(await page.evaluate(() => (window.propertyFormOriginalNodes[0] as HTMLTableElement).style.width)).toBe('55%');
});

test('read-only blocks synthetic submission, IME Enter stays a draft and ordinary Enter applies once', async ({ page }) => {
  await initialize(page, { logical: false });
  const before = await html(page);
  await field(page, 'width').fill('63%');
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(field(page, 'width')).toBeDisabled();
  await expect(field(page, 'width')).toHaveValue('63%');
  await apply(page).evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.setReadOnly(false));
  await focusFirstCell(page);
  await field(page, 'width').fill('63%');
  await field(page, 'width').evaluate((input) => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
  expect(await html(page)).toBe(before);
  await field(page, 'width').press('Enter');
  expect(await page.evaluate(() => window.editor.surface.querySelector<HTMLTableElement>('table')!.style.width)).toBe('63%');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('invalid values and setup leave the form intact while async error callbacks and detached controls stay contained', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await initialize(page, { logical: false, rejectErrors: true });
  expect(await page.evaluate(() => {
    const before = window.propertyForm.getValues();
    let invalidValues = false;
    try { window.propertyForm.setValues({ width: '70%', alignment: 'unsafe' }); }
    catch { invalidValues = true; }
    const host = document.createElement('div');
    document.body.append(host);
    let invalidOptions = false;
    try { window.propertyFormFactory(host, window.editor, { label: 42 } as never); }
    catch { invalidOptions = true; }
    return { invalidValues, invalidOptions, sameValues: JSON.stringify(window.propertyForm.getValues()) === JSON.stringify(before), hostEmpty: !host.childNodes.length };
  })).toEqual({ invalidValues: true, invalidOptions: true, sameValues: true, hostEmpty: true });
  const before = await html(page);
  await field(page, 'width').fill('url(https://invalid.example/resource)');
  await apply(page).click();
  await expect(tools(page).getByRole('status')).toHaveText('Could not apply table properties.');
  await expect.poll(() => page.evaluate(() => window.propertyFormErrors.length)).toBe(1);
  expect(await html(page)).toBe(before);
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => {
    const form = window.propertyForm;
    const button = form.element.querySelector('button')!;
    form.destroy();
    form.destroy();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    let rejected = false;
    try { form.setValues({ width: '80%' }); }
    catch { rejected = true; }
    return { connected: form.element.isConnected, rejected, html: window.editor.getHTML(), history: window.editor.canUndo() };
  })).toEqual({ connected: false, rejected: true, html: before, history: false });
});

test('owned external focus preserves logical cells while unsupported hosts and outside focus cannot retain a draft', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const disconnected = document.createElement('div');
    const inside = document.createElement('div');
    window.editor.surface.append(inside);
    const populated = document.createElement('div');
    populated.textContent = 'Application content';
    document.body.append(populated);
    const outcomes = [disconnected, inside, populated, window.editor.element].map((host) => {
      try { window.propertyFormFactory(host, window.editor); return false; }
      catch { return true; }
    });
    inside.remove();
    return outcomes;
  })).toEqual([true, true, true, true]);
  const before = await html(page);
  await field(page, 'cellBorder').fill('#123456');
  await apply(page).click();
  expect(await page.evaluate(() => [...window.editor.surface.querySelectorAll<HTMLTableCellElement>('table[title="Owner"] td')].filter((cell) => cell.style.borderColor).map((cell) => cell.title))).toEqual(['A', 'B', 'C']);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  await focusFirstCell(page);
  await field(page, 'width').fill('80%');
  await page.evaluate(() => {
    const outside = document.createElement('button');
    outside.textContent = 'Outside form';
    document.body.append(outside);
    outside.focus();
  });
  await expect(apply(page)).toBeDisabled();
  await apply(page).evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const text = window.editor.surface.querySelector('[title="A"] strong')!.firstChild!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const before = window.propertyFormCommands.getState().cellBackground;
    window.propertyForm.destroy();
    document.querySelector('.property-form-host')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    return { before, after: window.propertyFormCommands.getState().cellBackground };
  })).toEqual({ before: 'mixed', after: 'rgb(17, 34, 51)' });
});

test('independent forms own only their editor lifecycle and selective imports do not require browser globals', async ({ page, browserName }) => {
  if (browserName === 'chromium') {
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', "const ui=await import('@morfira-dev/wysiwyg/ui/table-properties');if(typeof ui.createTablePropertiesForm!=='function')throw Error('Missing public form');console.log('server-import-ok')"], { cwd: process.cwd(), encoding: 'utf8' });
    expect(output.trim()).toBe('server-import-ok');
  }
  await initialize(page, { logical: false });
  await page.evaluate(async () => {
    const path = '/packages/plugins/dist/table-properties.js';
    const { tableProperties } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/table-properties');
    const host = document.createElement('div');
    host.className = 'property-second-editor';
    const formHost = document.createElement('div');
    formHost.className = 'property-second-form';
    document.body.append(host, formHost);
    window.propertyFormSecondEditor = window.createEditor(host, { locale: 'en', value: '<table><tbody><tr><td><p>Independent</p></td></tr></tbody></table>', plugins: [window.createTables(), tableProperties()] });
    const surface = window.propertyFormSecondEditor.surface;
    surface.focus();
    const range = document.createRange();
    range.selectNodeContents(surface.querySelector('p')!);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.propertyFormSecond = window.propertyFormFactory(formHost, window.propertyFormSecondEditor, { label: 'Independent form' });
    window.propertyFormSecond.setValues({ width: '75%' });
    window.editor.destroy();
  });
  await expect(tools(page).locator('.mw-table-properties-form')).toHaveCount(0);
  const second = page.locator('.property-second-form');
  await expect(second.getByRole('form', { name: 'Independent form', exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Apply properties', exact: true }).click();
  expect(await page.evaluate(() => window.propertyFormSecondEditor!.surface.querySelector<HTMLTableElement>('table')!.style.width)).toBe('75%');
  expect(await page.evaluate(() => window.propertyFormSecondEditor!.canUndo())).toBe(true);
  await page.evaluate(() => window.propertyFormSecondEditor!.destroy());
  await expect(second.locator('.mw-table-properties-form')).toHaveCount(0);
});
