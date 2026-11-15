import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, html = '<p><br></p>') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    const path = '/packages/plugins/dist/presets/standard.js';
    const { createStandardPreset } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/presets/standard');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'preset-test';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, createStandardPreset({ value, locale: 'en', onChange: (change) => window.changes.push(change) }));
    window.editor.setSelection(window.editor.surface.textContent!.length);
  }, html);
};
const content = (page: Page) => page.locator('.preset-test .mw-content');

test('all preset imports and factory calls are server-safe, fresh and never invoke providers', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    Object.defineProperty(globalThis, 'document', { get: () => { throw new Error('DOM accessed'); } });
    Object.defineProperty(globalThis, 'customElements', { get: () => { throw new Error('Global registration accessed'); } });
    globalThis.fetch = () => { throw new Error('Network accessed'); };
    const { createMinimalPreset } = await import('@morfira-dev/wysiwyg/presets/minimal');
    const { createStandardPreset } = await import('@morfira-dev/wysiwyg/presets/standard');
    const { createExtendedPreset } = await import('@morfira-dev/wysiwyg/presets/extended');
    const provide = () => { throw new Error('Provider called during configuration'); };
    const a = createStandardPreset();
    const b = createStandardPreset();
    const extended = createExtendedPreset({ mentions: { provide }, slash: { provide } });
    console.log(JSON.stringify({ minimal: createMinimalPreset().plugins.map(p => p.name), standard: a.plugins.map(p => p.name), extended: extended.plugins.map(p => p.name), freshArray: a.plugins !== b.plugins, freshPlugins: a.plugins.every((p,i) => p !== b.plugins[i]) }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual({
    minimal: [],
    standard: ['tables', 'images', 'search', 'statistics', 'markdown-shortcuts', 'autolink', 'horizontal-rule'],
    extended: ['tables', 'images', 'search', 'statistics', 'markdown-shortcuts', 'autolink', 'horizontal-rule', 'mentions', 'slash'],
    freshArray: true,
    freshPlugins: true,
  });
});

test('minimal copies schema, translations and arrays while retaining explicit application callbacks and plugins', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/presets/minimal.js';
    const { createMinimalPreset } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/presets/minimal');
    const plugin = { name: 'app:example', setup: () => {} };
    const values = ['note', 'warning'];
    const definitions = [{ name: 'app:note', kind: 'block' as const, tag: 'blockquote' as const, attributes: { 'data-tone': { type: 'enum' as const, values, required: true } } }];
    const translations = { 'editor.label': 'Copied label' };
    const change = () => {};
    const input = Object.freeze({ plugins: Object.freeze([plugin]), schema: definitions, translations, onChange: change, value: '<blockquote data-mw-node="app:note" data-tone="note">Copied</blockquote>' });
    const options = createMinimalPreset(input);
    values.splice(0, values.length, 'changed');
    definitions[0].name = 'app:changed';
    translations['editor.label'] = 'Changed label';
    window.editor.destroy();
    const host = document.createElement('div');
    host.className = 'minimal-preset-test';
    document.body.append(host);
    window.editor = window.createEditor(host, options);
    return { html: window.editor.getHTML(), label: window.editor.surface.getAttribute('aria-label'), samePlugin: options.plugins![0] === plugin, copiedPlugins: !Object.is(options.plugins, input.plugins), copiedSchema: options.schema !== input.schema, sameCallback: options.onChange === change, optionsKeys: Object.keys(options).sort() };
  });
  expect(result.html).toBe('<blockquote data-mw-node="app:note" data-tone="note">Copied</blockquote>');
  expect(result.label).toBe('Copied label');
  expect(result.samePlugin).toBe(true);
  expect(result.copiedPlugins).toBe(true);
  expect(result.copiedSchema).toBe(true);
  expect(result.sameCallback).toBe(true);
  expect(result.optionsKeys).toEqual(['onChange', 'plugins', 'schema', 'translations', 'value']);
});

test('standard exposes ready image, search and Unicode statistics behavior with one-step history', async ({ page }) => {
  await initialize(page, '<p>Alpha Beta</p>');
  await page.evaluate(() => {
    window.searchCommands(window.editor).setQuery('Beta');
    window.searchCommands(window.editor).replaceAll('Gamma');
  });
  await expect(content(page)).toHaveText('Alpha Gamma');
  expect(await page.evaluate(() => window.statisticsCommands(window.editor).getState().document.words)).toBe(2);
  await page.evaluate(() => window.editor.undo());
  await expect(content(page)).toHaveText('Alpha Beta');
  await page.evaluate(() => {
    window.searchCommands(window.editor).clear();
    window.editor.setSelection(10);
    window.imageCommands(window.editor).insert({ src: '/logo.svg', alt: 'Preset image', width: 64, caption: 'Caption' });
  });
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Preset image');
  await expect(content(page).locator('figcaption')).toHaveText('Caption');
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('img')).toHaveCount(0);
  await expect(content(page)).toHaveText('Alpha Beta');
});

test('standard native Markdown and autolink preserve conversion undo and subsequent caret behavior', async ({ page }) => {
  await initialize(page);
  await page.keyboard.type('# ');
  await expect(content(page).locator('h1')).toHaveCount(1);
  await page.keyboard.type('Title');
  await expect(content(page).locator('h1')).toHaveText('Title');
  await page.evaluate(() => { window.editor.setHTML('<p><br></p>'); window.editor.setSelection(0); });
  await page.keyboard.type('https://example.com ');
  await expect(content(page).locator('a')).toHaveAttribute('href', 'https://example.com');
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('a')).toHaveCount(0);
  expect(await page.evaluate(() => window.editor.surface.textContent!.replace(/\u00a0/g, ' '))).toBe('https://example.com ');
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('after');
  await expect(content(page).locator('a')).toHaveText('https://example.com');
  await expect(content(page)).toContainText('after');
});

test('standard table operations keep merged-cell content and atomic history', async ({ page }) => {
  const original = '<table><tbody><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td></tr></tbody></table><p>Tail</p>';
  await initialize(page, original);
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => {
    window.editor.setSelection(0);
    window.tableCommands(window.editor).select({ row: 0, column: 0 });
    window.tableCommands(window.editor).rowBelow();
  });
  await expect(content(page).locator('tr')).toHaveCount(3);
  await expect(content(page).locator('td[rowspan="2"]')).toHaveText('A');
  await expect(content(page)).toContainText('B');
  await expect(content(page)).toContainText('C');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => window.editor.redo());
  await expect(content(page).locator('tr')).toHaveCount(3);
  await expect(content(page).locator('td[rowspan="2"]')).toHaveText('A');
});

test('feature options are copied and disabled features do not install plugin state or leak preset keys', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/presets/standard.js';
    const { createStandardPreset } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/presets/standard');
    const source = { enabled: false };
    const options = createStandardPreset({ markdown: source, tables: false, images: false, search: false, statistics: false, autolink: false, horizontalRule: false, locale: 'ru' });
    source.enabled = true;
    window.editor.destroy();
    const host = document.createElement('div');
    document.body.append(host);
    window.editor = window.createEditor(host, options);
    return { plugins: options.plugins!.map((plugin) => plugin.name), keys: Object.keys(options).sort(), markdown: window.markdownCommands(window.editor).getState().enabled, absent: ['tables', 'images', 'search', 'statistics', 'autolink', 'horizontal-rule'].every((key) => window.editor.getPlugin(key) === undefined) };
  });
  expect(result).toEqual({ plugins: ['markdown-shortcuts'], keys: ['locale', 'plugins'], markdown: false, absent: true });
});

test('standard upload uses the copied application callback and keeps transport application-owned', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/presets/standard.js';
    const { createStandardPreset } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/presets/standard');
    let originalCalls = 0;
    let changedCalls = 0;
    const imageOptions = { upload: async () => { originalCalls++; return { src: '/logo.svg', alt: 'Application upload' }; } };
    const options = createStandardPreset({ images: imageOptions });
    imageOptions.upload = async () => { changedCalls++; return { src: '/wrong.svg', alt: 'Changed' }; };
    window.editor.destroy();
    const host = document.createElement('div');
    host.className = 'upload-preset-test';
    document.body.append(host);
    window.editor = window.createEditor(host, options);
    window.editor.setSelection(0);
    const inserted = await window.imageCommands(window.editor).upload(new File(['image'], 'test.png', { type: 'image/png' }));
    return { inserted, originalCalls, changedCalls, html: window.editor.getHTML() };
  });
  expect(result.inserted).toBe(true);
  expect(result.originalCalls).toBe(1);
  expect(result.changedCalls).toBe(0);
  expect(result.html).toContain('alt="Application upload"');
  expect(result.html).not.toContain('wrong.svg');
});

test('preset instances isolate preferences and destruction while read-only accepts external values', async ({ page }) => {
  await initialize(page, '<p>First</p>');
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/presets/standard.js';
    const { createStandardPreset } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/presets/standard');
    const host = document.createElement('div');
    document.body.append(host);
    const other = window.createEditor(host, createStandardPreset({ value: '<p>Second</p>', readOnly: true }));
    const api = window.markdownCommands(window.editor);
    api.setEnabled(false);
    const independent = window.markdownCommands(other).getState().enabled;
    other.setHTML('<p>External</p>');
    other.setSelection(8);
    window.imageCommands(other).insert({ src: '/logo.svg' });
    const readonlyHTML = other.getHTML();
    window.editor.destroy();
    let staleRejected = false;
    try { api.getState(); } catch { staleRejected = true; }
    other.setReadOnly(false);
    other.insertHTML('!');
    const otherHTML = other.getHTML();
    other.destroy();
    return { independent, readonlyHTML, staleRejected, otherHTML };
  });
  expect(result).toEqual({ independent: true, readonlyHTML: '<p>External</p>', staleRejected: true, otherHTML: '<p>External!</p>' });
});

test('extended uses explicit providers and fresh default structural slash actions with undo', async ({ page }) => {
  await initialize(page);
  await page.evaluate(async () => {
    const path = '/packages/plugins/dist/presets/extended.js';
    const { createExtendedPreset } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/presets/extended');
    window.editor.destroy();
    const host = document.createElement('div');
    host.className = 'extended-preset-test';
    document.body.append(host);
    window.editor = window.createEditor(host, createExtendedPreset({
      mentions: { provide: () => [{ id: 'anna', label: 'Anna' }], debounceMs: 0 },
      slash: { provide: () => [{ id: 'heading', label: 'Heading 2', action: 'heading2' }], debounceMs: 0 },
    }));
    window.editor.setSelection(0);
  });
  await page.keyboard.type('/h');
  await expect.poll(() => page.evaluate(() => window.slashCommands(window.editor).getState().status)).toBe('ready');
  await page.evaluate(() => window.slashCommands(window.editor).choose('heading'));
  await expect(page.locator('.extended-preset-test h2')).toHaveCount(1);
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.extended-preset-test .mw-content')).toHaveText('/h');
  await page.evaluate(() => { window.editor.setHTML('<p><br></p>'); window.editor.setSelection(0); });
  await page.keyboard.type('@a');
  await expect.poll(() => page.evaluate(() => window.mentionCommands(window.editor).getState().status)).toBe('ready');
  await page.evaluate(() => window.mentionCommands(window.editor).choose('anna'));
  await expect(page.locator('.extended-preset-test .mw-content')).toHaveText('@Anna ');
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.extended-preset-test .mw-content')).toHaveText('@a');
});

test('invalid preset configuration fails early while duplicate app plugin names remain core-owned', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const standardPath = '/packages/plugins/dist/presets/standard.js';
    const extendedPath = '/packages/plugins/dist/presets/extended.js';
    const { createStandardPreset } = await import(/* @vite-ignore */ standardPath) as typeof import('@morfira-dev/wysiwyg/presets/standard');
    const { createExtendedPreset } = await import(/* @vite-ignore */ extendedPath) as typeof import('@morfira-dev/wysiwyg/presets/extended');
    const malformed: unknown[] = [null, [], { unknown: true }, { images: true }, { search: {} }, { horizontalRule: {} }, { tables: { onClipboardError: 1 } }, { images: { upload: 1 } }, { autolink: { enabled: 'yes' } }, { historyLimit: 0 }];
    let rejected = 0;
    for (const input of malformed) {
      try { createStandardPreset(input as never); }
      catch { rejected++; }
    }
    let providersRejected = false;
    try { createExtendedPreset({} as never); } catch { providersRejected = true; }
    const duplicate = createStandardPreset({ plugins: [{ name: 'images', setup: () => {} }] });
    const host = document.createElement('div');
    let duplicateRejected = false;
    try { window.createEditor(host, duplicate); } catch { duplicateRejected = true; }
    return { rejected, providersRejected, duplicateRejected, untouchedHost: host.childNodes.length };
  });
  expect(result).toEqual({ rejected: 10, providersRejected: true, duplicateRejected: true, untouchedHost: 0 });
});
