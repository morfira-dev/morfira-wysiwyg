import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { FontCommands, FontsOptions } from '@morfira-dev/wysiwyg/plugins/fonts';

declare global { interface Window { fontAPI: FontCommands; } }

const initialize = async (page: Page, value: string, options?: FontsOptions) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, options }) => {
    const path = '/packages/plugins/dist/fonts.js';
    const { fonts, fontCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/fonts');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'fonts-test';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, plugins: [fonts(options)], onChange: (change) => window.changes.push(change) });
    window.fontAPI = fontCommands(window.editor);
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, { value, options });
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const content = (page: Page) => page.locator('.fonts-test .mw-content');

test('partial backward formatting retains rich links and independent properties with exact undo', async ({ page }) => {
  const before = '<p><a href="/safe"><strong>abcdef</strong></a><em>keep</em></p>';
  await initialize(page, before);
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(text, 4, text, 2);
    window.fontAPI.setFamily('serif');
    window.fontAPI.setSize(24);
  });
  expect(await page.evaluate(() => window.fontAPI.getState())).toEqual({ disabled: false, family: 'Georgia, serif', size: '24px', familyMixed: false, sizeMixed: false });
  const links = content(page).locator('a');
  expect(await links.count()).toBeGreaterThan(0);
  expect(await links.evaluateAll((nodes) => nodes.every((node) => node.getAttribute('href') === '/safe'))).toBe(true);
  expect((await links.allTextContents()).join('')).toBe('abcdef');
  expect((await content(page).locator('strong').allTextContents()).join('')).toBe('abcdef');
  await expect(content(page).locator('em')).toHaveText('keep');
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), changes: window.changes.map((change) => change.source) }))).toEqual({ selection: { index: 2, length: 2 }, changes: ['user', 'user'] });
  await page.evaluate(() => window.fontAPI.setFamily(false));
  expect(await page.evaluate(() => window.fontAPI.getState())).toMatchObject({ family: false, size: '24px', familyMixed: false, sizeMixed: false });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.fontAPI.getState())).toMatchObject({ family: 'Georgia, serif', size: '24px' });
  await page.evaluate(() => window.fontAPI.setSize(false));
  expect(await page.evaluate(() => window.fontAPI.getState())).toMatchObject({ family: 'Georgia, serif', size: false });
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const text = window.editor.surface.querySelector('strong')!.firstChild;
    return { nativeBackward: selection.anchorNode === text && selection.focusNode === text && selection.anchorOffset === 4 && selection.focusOffset === 2, undo: window.editor.canUndo() };
  })).toEqual({ nativeBackward: true, undo: false });
});

test('pending styles type and undo together while a synchronous expanded range drops stale caret affinity', async ({ page }) => {
  await initialize(page, '<p>Start</p>');
  await page.evaluate(() => {
    window.editor.setSelection(5);
    window.fontAPI.setFamily('monospace');
    window.fontAPI.setSize(18);
    window.editor.format('bold', true);
  });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.keyboard.type('X');
  await expect(content(page)).toHaveText('StartX');
  await expect(content(page).locator('strong')).toHaveText('X');
  expect(await page.evaluate(() => window.fontAPI.getState())).toMatchObject({ family: 'monospace', size: '18px' });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>Start</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await expect(content(page)).toHaveText('StartX');
  expect(await page.evaluate(() => window.fontAPI.getState())).toMatchObject({ family: 'monospace', size: '18px' });
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<p>ABCDE</p>');
    editor.setSelection(0);
    window.fontAPI.setFamily('serif');
    const pending = window.fontAPI.getState().family;
    const text = editor.surface.querySelector('p')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 0, text, 2);
    window.fontAPI.setSize(24);
    return { pending, family: window.fontAPI.getState().family, size: window.fontAPI.getState().size, selection: editor.getSelection() };
  })).toEqual({ pending: 'Georgia, serif', family: false, size: '24px', selection: { index: 0, length: 2 } });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>ABCDE</p>');
  expect(await page.evaluate(() => window.fontAPI.getState().family)).toBe(false);
});

test('one cross-block list and merged-cell range preserves structure and exposes explicit mixed state', async ({ page }) => {
  const before = '<p>AB</p><ul><li><p>CD</p></li></ul><table><tbody><tr><td rowspan="2"><p>EF</p></td><td>GH</td></tr><tr><td>IJ</td></tr></tbody></table><p>Tail</p>';
  await initialize(page, before);
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!.firstChild!, 1, root.querySelector('td p')!.firstChild!, 1);
    window.fontAPI.setFamily('monospace');
    window.fontAPI.setSize(18);
  });
  expect(await page.evaluate(() => window.fontAPI.getState())).toMatchObject({ family: 'monospace', size: '18px', familyMixed: false, sizeMixed: false });
  await expect(content(page).locator('li')).toHaveCount(1);
  await expect(content(page).locator('td')).toHaveCount(3);
  await expect(content(page).locator('td[rowspan="2"]')).toHaveText('EF');
  await expect(content(page)).toHaveText('ABCDEFGHIJTail');
  await page.evaluate(() => window.editor.setSelection(0, window.editor.surface.textContent!.length));
  expect(await page.evaluate(() => window.fontAPI.getState())).toMatchObject({ familyMixed: true, sizeMixed: true });
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('plugin-independent HTML, JSON and paste retain safe unknown families and filter concrete CSS injection forms without font requests', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/__morfira_font_probe__*', async (route) => { requests.push(route.request().url()); await route.abort(); });
  await initialize(page, '<p>Target</p>');
  const output = await page.evaluate(async () => {
    const corePath = '/packages/core/dist/index.js';
    const { sanitizeHTML } = await import(/* @vite-ignore */ corePath) as typeof import('@morfira-dev/wysiwyg');
    const editor = window.editor;
    const safe = '<p><span style="font-family: Custom Local, serif; font-size: 1.5em">Imported</span></p>';
    editor.setHTML(safe);
    editor.setSelection(0, 8);
    const state = window.fontAPI.getState();
    const normalized = editor.getHTML();
    const json = editor.getJSON();
    editor.destroy();
    const host = document.createElement('div');
    document.body.append(host);
    const plain = window.createEditor(host, { value: normalized });
    plain.setJSON(json);
    const withoutPlugin = plain.getHTML();
    plain.setHTML('<p>Target</p>');
    plain.setSelection(0, 6);
    const data = new DataTransfer();
    data.setData('text/html', safe);
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: data });
    plain.surface.dispatchEvent(paste);
    const pasted = plain.getHTML();
    const malicious = ['url(/__morfira_font_probe__?url)', 'var(--private)', 'A/**/, serif', 'inherit', 'Arial\\, serif', 'Arial,,serif', 'A,B,C,D,E,F,G,H,I', 'A'.repeat(257)];
    const filtered = malicious.map((family) => {
      const html = `<p><span style="font-family: ${family}; color: red">Safe</span></p>`;
      const output = sanitizeHTML(html);
      return { familyRemoved: !output.includes('font-family'), textRetained: output.includes('Safe'), colorRetained: output.includes('color: red') };
    });
    const jsonUnsafe = { version: 1 as const, children: [{ type: 'element' as const, tag: 'p' as const, attributes: { style: 'font-family: url(/__morfira_font_probe__?json); color: red' }, children: [{ type: 'text' as const, text: 'JSON' }] }] };
    plain.setJSON(jsonUnsafe);
    const jsonFiltered = plain.getHTML();
    const boundaries = {
      eightNames: sanitizeHTML('<p style="font-family: A,B,C,D,E,F,G,H">Eight</p>'),
      maxName: sanitizeHTML(`<p style="font-family: ${'A'.repeat(256)}">Bound</p>`),
      quotedGeneric: sanitizeHTML('<p style="font-family: &quot;serif&quot;">Quoted</p>'),
      unquotedGeneric: sanitizeHTML('<p style="font-family: SERIF">Generic</p>'),
    };
    plain.destroy();
    host.remove();
    return { state, normalized, withoutPlugin, pasted, filtered, jsonFiltered, boundaries };
  });
  expect(output).toMatchObject({ state: { family: '"Custom Local", serif', size: '1.5em', familyMixed: false, sizeMixed: false }, withoutPlugin: output.normalized, pasted: output.normalized, filtered: Array.from({ length: 8 }, () => ({ familyRemoved: true, textRetained: true, colorRetained: true })), jsonFiltered: '<p style="color: red">JSON</p>', boundaries: { eightNames: '<p style="font-family: A, B, C, D, E, F, G, H">Eight</p>', maxName: `<p style="font-family: ${'A'.repeat(256)}">Bound</p>`, quotedGeneric: '<p style="font-family: &quot;serif&quot;">Quoted</p>', unquotedGeneric: '<p style="font-family: serif">Generic</p>' } });
  expect(output.normalized).toContain('font-family: &quot;Custom Local&quot;, serif');
  // Observe the native resource scheduling turn; matching probes are local and aborted.
  await page.waitForTimeout(150);
  expect(requests).toEqual([]);
});

test('invalid configuration and command payloads reject atomically without clearing redo', async ({ page }) => {
  await initialize(page, '<p>ABCDE</p>');
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/fonts.js';
    const { fonts } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/fonts');
    const invalid: unknown[] = [null, { extra: true }, { families: [] }, { families: [{ id: 'Bad ID', label: 'Bad', family: 'serif' }] }, { families: [{ id: 'one', label: 'One', family: 'serif' }, { id: 'one', label: 'Two', family: 'monospace' }] }, { families: [{ id: 'bad', label: 'Bad', family: 'url(/bad)' }] }, { sizes: [7] }, { sizes: [12, 12] }, { sizes: [12.5] }];
    const configRejected = invalid.map((value) => { try { fonts(value as never); return false; } catch { return true; } });
    const editor = window.editor;
    editor.setSelection(1, 2);
    window.fontAPI.setSize(24);
    editor.undo();
    const before = { html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    const invalidCalls = [() => window.fontAPI.setFamily('unknown'), () => window.fontAPI.setFamily(true as never), () => window.fontAPI.setSize(13), () => window.fontAPI.setSize('24' as never)];
    const commandRejected = invalidCalls.map((call) => { try { call(); return false; } catch { return true; } });
    const after = { html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    return { configRejected, commandRejected, unchanged: JSON.stringify(before) === JSON.stringify(after), redo: editor.canRedo() };
  })).toEqual({ configRejected: Array(9).fill(true), commandRejected: Array(4).fill(true), unchanged: true, redo: true });
});

test('copied per-instance choices, read-only, composition and disposal preserve external synchronization', async ({ page }) => {
  await initialize(page, '<p>First</p>');
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/fonts.js';
    const { fonts, fontCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/fonts');
    const families = [{ id: 'local', label: 'Local', family: 'Local Font, serif' }];
    const sizes = [20];
    const configured = fonts({ families, sizes });
    const host = document.createElement('div');
    document.body.append(host);
    const second = window.createEditor(host, { value: '<p>Second</p>', plugins: [configured] });
    const api = fontCommands(second);
    families[0].id = 'changed';
    families[0].family = 'monospace';
    sizes[0] = 30;
    second.setSelection(0, 6);
    api.setFamily('local');
    api.setSize(20);
    const copied = api.getState();
    const firstUnchanged = window.editor.getHTML();
    second.setReadOnly(true);
    const readonly = api.getState().disabled;
    const baseline = second.getHTML();
    api.setFamily(false);
    api.setSize(false);
    const guarded = second.getHTML() === baseline;
    second.setHTML('<p>External</p>');
    second.setReadOnly(false);
    second.setSelection(0, 8);
    second.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = api.getState().disabled;
    api.setSize(20);
    const during = second.getHTML();
    second.setHTML('<p>Authoritative</p>');
    second.setSelection(0, 13);
    const resumed = api.getState();
    api.setSize(20);
    second.destroy();
    let disposed = 0;
    for (const call of [api.getState, () => api.setSize(20)]) {
      try { call(); } catch { disposed++; }
    }
    host.remove();
    return { copied, firstUnchanged, readonly, composing, guarded, during, resumed, disposed };
  })).toMatchObject({ copied: { family: '"Local Font", serif', size: '20px', disabled: false }, firstUnchanged: '<p>First</p>', readonly: true, composing: true, guarded: true, during: '<p>External</p>', resumed: { family: false, size: false, disabled: false }, disposed: 2 });
});

test('selective font imports and configuration are SSR-safe without DOM, FontFace or network access', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    for (const key of ['document', 'window', 'FontFace']) Object.defineProperty(globalThis, key, { get: () => { throw new Error('Browser API accessed'); } });
    globalThis.fetch = () => { throw new Error('Network accessed'); };
    const { fonts, fontCommands } = await import('@morfira-dev/wysiwyg/plugins/fonts');
    console.log(JSON.stringify({ name: fonts().name, factory: typeof fontCommands, configured: fonts({ families: [{ id: 'local', label: 'Local', family: 'Local Font, serif' }], sizes: [20] }).name }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual({ name: 'fonts', factory: 'function', configured: 'fonts' });
});
