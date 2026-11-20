import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PreviewTestOptions } from './preview.types.js';
import './preview.types.js';

const panel = (page: Page) => page.locator('.preview-test-host');
const content = (page: Page) => panel(page).locator('.mw-preview-content');
const editorContent = (page: Page) => page.locator('.preview-editor .mw-content');

const initialize = async (page: Page, options: PreviewTestOptions = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, live, images }) => {
    window.dispose();
    const path = '/packages/wysiwyg/dist/ui/preview.js';
    window.previewModule = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/preview');
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/packages/plugins/dist/ui/preview.css';
    await new Promise<void>((resolve, reject) => {
      css.onload = () => resolve();
      css.onerror = () => reject(new Error('Missing preview CSS'));
      document.head.append(css);
    });
    const mount = document.createElement('div');
    mount.className = 'preview-editor';
    const host = document.createElement('div');
    host.className = 'preview-test-host';
    document.body.prepend(mount, host);
    window.changes = [];
    window.previewErrors = [];
    window.previewErrorAction = undefined;
    window.editor = window.createEditor(mount, { value, locale: 'en', onChange: (change) => window.changes.push(change) });
    window.editor.focus();
    window.editor.setSelection(1);
    window.previewHost = host;
    window.previewUI = window.previewModule.createPreviewUI(host, window.editor, {
      live, images,
      onError: (error) => {
        window.previewErrors.push(error);
        window.previewErrorAction?.();
      },
    });
    window.dispose = () => { window.previewUI.destroy(); window.editor.destroy(); mount.remove(); host.remove(); };
  }, { value: options.value ?? '<p>Alpha <strong>bold</strong></p>', live: options.live ?? true, images: options.images ?? 'omit' });
};

test('rich preview retains formatting and grid semantics without changing actual source nodes, selection or history', async ({ page }) => {
  await initialize(page, { value: '<h2>Heading</h2><p>Text <strong>bold</strong></p><blockquote>Quote</blockquote><ul><li>List</li></ul><table><tr><th scope="col">Head</th><td colspan="2">Merged</td></tr></table>' });
  const source = await editorContent(page).locator('strong').elementHandle();
  const before = await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    window.editor.focus();
    document.getSelection()!.setBaseAndExtent(text, 4, text, 0);
    return { html: window.editor.getHTML(), json: JSON.stringify(window.editor.getJSON()), selection: window.editor.getSelection(), changes: window.changes.length };
  });
  await panel(page).getByRole('button', { name: 'Preview document', exact: true }).click();
  await expect(content(page).locator('h2')).toHaveText('Heading');
  await expect(content(page).locator('strong')).toHaveText('bold');
  await expect(content(page).locator('td')).toHaveAttribute('colspan', '2');
  await expect(content(page)).not.toHaveAttribute('contenteditable', 'true');
  expect(await source!.evaluate((node) => node === window.editor.surface.querySelector('strong'))).toBe(true);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), json: JSON.stringify(window.editor.getJSON()), selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual(before);
  await panel(page).getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(content(page)).toBeEmpty();
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('default image policy creates no additional resource request or image node; links and labels are inert literal data', async ({ page }) => {
  let requests = 0;
  let navigations = 0;
  await page.route('**/preview-probe.png', async (route) => { requests++; await route.abort(); });
  await page.route('**/must-not-navigate', async (route) => { navigations++; await route.abort(); });
  await initialize(page, { value: '<p><a href="/must-not-navigate" target="_blank">Link</a></p><figure><img src="/preview-probe.png" alt="&lt;img onerror=bad()&gt;"><figcaption>Caption</figcaption></figure>' });
  await expect.poll(() => requests).toBe(1);
  await page.evaluate(() => window.previewUI.open());
  await expect(content(page).locator('img,source,script,iframe')).toHaveCount(0);
  await expect(content(page).locator('.mw-preview-image')).toHaveText('<img onerror=bad()>');
  await expect(content(page).locator('a')).not.toHaveAttribute('href');
  await expect(content(page).locator('a')).not.toHaveAttribute('target');
  await content(page).locator('a').click();
  await page.evaluate(() => { window.previewUI.refresh(); window.previewUI.close(); window.previewUI.open(); });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(requests).toBe(1);
  expect(navigations).toBe(0);
});

test('explicit image loading uses validated snapshot URLs and closing releases owned content', async ({ page }) => {
  let requests = 0;
  await page.route('**/preview-load.svg', async (route) => { requests++; await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>' }); });
  await initialize(page, { images: 'load', value: '<figure><img src="/preview-load.svg" alt="Image"></figure>' });
  await expect.poll(() => requests).toBe(1);
  await page.evaluate(() => window.previewUI.open());
  await expect(content(page).locator('img')).toHaveAttribute('src', '/preview-load.svg');
  await expect(content(page).locator('img')).toHaveJSProperty('complete', true);
  expect(requests).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => window.previewUI.close());
  await expect(content(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.previewUI.isOpen())).toBe(false);
});

test('closed views do not read documents, live changes coalesce, and close cancels queued rendering', async ({ page }) => {
  await initialize(page);
  const readings = await page.evaluate(async () => {
    const editor = window.editor;
    const original = editor.getJSON.bind(editor);
    let reads = 0;
    editor.getJSON = () => { reads++; return original(); };
    editor.setHTML('<p>Closed update</p>');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const closed = reads;
    window.previewUI.open();
    reads = 0;
    editor.setHTML('<p>First</p>');
    editor.setHTML('<p>Second</p>');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const coalesced = reads;
    editor.setHTML('<p>Cancel</p>');
    window.previewUI.close();
    const before = reads;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    editor.getJSON = original;
    return { closed, coalesced, canceled: before === reads, html: editor.getHTML() };
  });
  expect(readings).toEqual({ closed: 0, coalesced: 1, canceled: true, html: '<p>Cancel</p>' });
  await expect(content(page)).toBeEmpty();
  await page.evaluate(() => window.previewUI.open());
  await expect(content(page)).toHaveText('Cancel');
});

test('manual preview, readonly, locale and Escape stay observational and do not steal outside focus', async ({ page }) => {
  await initialize(page, { live: false });
  await page.evaluate(() => window.previewUI.open());
  await page.evaluate(() => { window.editor.setHTML('<p>Current</p>'); window.editor.setReadOnly(true); window.editor.setLocale('ru'); });
  await expect(content(page)).toHaveText('Current');
  await expect(panel(page).getByRole('button', { name: 'Закрыть предпросмотр', exact: true })).toBeEnabled();
  await page.evaluate(() => window.editor.setHTML('<p>Manual update</p>'));
  await expect(content(page)).toHaveText('Current');
  await panel(page).getByRole('button', { name: 'Обновить предпросмотр', exact: true }).click();
  await expect(content(page)).toHaveText('Manual update');
  await content(page).focus();
  await page.keyboard.press('Escape');
  await expect(content(page)).toBeHidden();
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: '<p>Manual update</p>', undo: false });
});

test('failed snapshots retain the prior atomic view; trusted error callbacks cannot revive disposed or closed previews', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.previewUI.open();
    const editor = window.editor;
    const original = editor.getJSON.bind(editor);
    editor.getJSON = () => ({ version: 1, children: [{ type: 'element', tag: 'script', attributes: {}, children: [] }] }) as never;
    window.previewUI.refresh();
    const before = window.previewUI.element.querySelector('.mw-preview-content')!.textContent;
    const errors = window.previewErrors.length;
    window.previewErrorAction = () => { window.previewUI.close(); throw new Error('Trusted diagnostic failure'); };
    window.previewUI.refresh();
    const callbackClosed = !window.previewUI.isOpen();
    window.previewErrorAction = undefined;
    editor.getJSON = () => { window.previewUI.close(); return original(); };
    window.previewUI.open();
    editor.getJSON = original;
    return { before, errors, callbackClosed, open: window.previewUI.isOpen(), empty: window.previewUI.element.querySelector('.mw-preview-content')!.childNodes.length === 0, html: editor.getHTML() };
  });
  expect(result).toEqual({ before: 'Alpha bold', errors: 1, callbackClosed: true, open: false, empty: true, html: '<p>Alpha <strong>bold</strong></p>' });
});

test('instances, malformed setup, detach and editor disposal isolate state and retained controls', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const editor = window.editor;
    const original = editor.getHTML();
    let failures = 0;
    for (const options of [{ images: 'all' }, { live: 'yes' }, { label: '' }, { onError: true }, { unknown: true }]) {
      const host = document.createElement('div');
      document.body.append(host);
      try { window.previewModule.createPreviewUI(host, editor, options as never); }
      catch { if (!host.childNodes.length) failures++; }
      host.remove();
    }
    window.previewUI.open();
    const secondHost = document.createElement('div');
    document.body.append(secondHost);
    const second = window.previewModule.createPreviewUI(secondHost, editor, { live: false });
    second.open();
    window.previewUI.close();
    const independent = second.isOpen();
    secondHost.remove();
    await Promise.resolve();
    const detached = !second.isOpen();
    second.destroy();
    const old = window.previewUI.element.querySelector<HTMLButtonElement>('button')!;
    window.previewUI.destroy();
    window.previewUI.destroy();
    old.click();
    let disposed = false;
    try { window.previewUI.open(); } catch { disposed = true; }
    const lastHost = document.createElement('div');
    document.body.append(lastHost);
    const last = window.previewModule.createPreviewUI(lastHost, editor);
    last.open();
    editor.destroy();
    const cleaned = lastHost.childNodes.length === 0;
    lastHost.remove();
    return { failures, independent, detached, disposed, cleaned, original };
  });
  expect(result).toEqual({ failures: 5, independent: true, detached: true, disposed: true, cleaned: true, original: '<p>Alpha <strong>bold</strong></p>' });
});
