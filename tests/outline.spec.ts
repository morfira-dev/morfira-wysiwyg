import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { OutlineTestOptions } from './outline.types.js';
import './outline.types.js';

const panel = (page: Page) => page.locator('.outline-test-host');
const buttons = (page: Page) => panel(page).getByRole('button');
const initialize = async (page: Page, options: OutlineTestOptions = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, maxHeadings, label }) => {
    window.dispose();
    const path = '/packages/wysiwyg/dist/ui/outline.js';
    window.outlineModule = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/outline');
    const mount = document.createElement('div');
    mount.className = 'outline-editor';
    const host = document.createElement('div');
    host.className = 'outline-test-host';
    document.body.prepend(mount, host);
    window.changes = [];
    window.outlineErrors = [];
    window.outlineErrorAction = undefined;
    window.editor = window.createEditor(mount, {
      value, locale: 'en', onChange: (change) => window.changes.push(change),
      schema: [
        { name: 'outline:protected-heading', kind: 'block', tag: 'h2', attributes: { 'data-id': { type: 'text', required: true } } },
        { name: 'outline:protected-quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } },
      ],
    });
    window.editor.setSelection(1);
    window.outlineHost = host;
    window.outlineUI = window.outlineModule.createOutlineUI(host, window.editor, {
      maxHeadings, label,
      onError: (error) => { window.outlineErrors.push(error); window.outlineErrorAction?.(); },
    });
    window.dispose = () => { window.outlineUI.destroy(); window.editor.destroy(); host.remove(); mount.remove(); };
  }, { value: options.value ?? '<h2>First</h2><p>Body</p><h3>Second</h3>', maxHeadings: options.maxHeadings ?? 100, label: options.label });
};

test('ordinary nested headings keep order and literal bounded labels without touching source, semantic owners or IDs', async ({ page }) => {
  const long = `${'x'.repeat(298)}😀${'z'.repeat(20)}`;
  await initialize(page, { value: `<h1>Main &lt;script&gt;</h1><blockquote><h3>Quote</h3></blockquote><ul><li><h4>List</h4></li></ul><table><tr><td><h5>Cell</h5></td></tr></table><h6></h6><h2>${long}</h2><h2 data-mw-node="outline:protected-heading" data-id="h">Protected</h2><blockquote data-mw-node="outline:protected-quote" data-id="q"><h2>Hidden</h2></blockquote><figure><img src="/logo.svg"><figcaption>Caption</figcaption></figure>` });
  const before = await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo() }));
  await expect(buttons(page)).toHaveCount(6);
  expect(await buttons(page).allTextContents()).toEqual(['Main <script>', 'Quote', 'List', 'Cell', 'Untitled heading', `${'x'.repeat(298)}…`]);
  expect(await buttons(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mw-outline-level')))).toEqual(['1', '3', '4', '5', '6', '2']);
  await expect(panel(page).locator('script,a')).toHaveCount(0);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual(before);
  expect(await page.evaluate(() => ({ ids: window.editor.surface.querySelectorAll('[id]').length, changes: window.changes.length }))).toEqual({ ids: 0, changes: 0 });
});

test('native keyboard navigation reaches exact heading start in readonly without a transaction and only a caret claims current location', async ({ page }) => {
  await initialize(page, { value: '<p>Before</p><h2><strong>Target</strong> tail</h2><h3>After</h3>' });
  const before = await page.evaluate(() => { window.editor.setReadOnly(true); return window.editor.getHTML(); });
  await buttons(page).first().focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const heading = window.editor.surface.querySelector('h2')!;
    const range = selection.getRangeAt(0);
    return { exact: range.startContainer === heading && range.startOffset === 0 && range.collapsed,
      html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() };
  })).toEqual({ exact: true, html: before, changes: 0, undo: false });
  await expect(buttons(page).first()).toHaveAttribute('aria-current', 'location');
  await page.evaluate(() => window.editor.setSelection(6, 3));
  await expect(panel(page).locator('[aria-current]')).toHaveCount(0);
  await buttons(page).last().focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => document.getSelection()!.anchorNode === window.editor.surface.querySelector('h3'))).toBe(true);
});

test('bounded outline reports truncation and refreshes committed API, native editing, history and locale without reading JSON', async ({ page }) => {
  await initialize(page, { value: '<h2>A</h2><h2>B</h2><h2>C</h2>', maxHeadings: 2 });
  await expect(buttons(page)).toHaveText(['A', 'B']);
  await expect(panel(page).getByRole('status')).toHaveText('Only the first headings are shown.');
  await page.evaluate(() => {
    window.editor.getJSON = () => { throw new Error('Outline must not snapshot JSON'); };
    window.editor.setHTML('<h2>New</h2>');
    window.editor.setSelection(3);
  });
  await expect(buttons(page)).toHaveText(['New']);
  await page.keyboard.type(' text');
  await expect(buttons(page)).toHaveText(['New text']);
  await page.evaluate(() => window.editor.undo());
  await expect(buttons(page)).toHaveText(['New']);
  await page.evaluate(() => { window.editor.setHTML('<p>Nothing</p>'); window.editor.setLocale('ru'); });
  await expect(panel(page).getByRole('navigation')).toHaveAttribute('aria-label', 'Оглавление документа');
  await expect(panel(page).getByRole('status')).toHaveText('В документе нет заголовков.');
  expect(await page.evaluate(() => window.outlineErrors.length)).toBe(0);
});

test('change bursts coalesce once per animation frame and pending old buttons cannot navigate a new document', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const ui = window.outlineUI.element;
    const oldButton = ui.querySelector('button')!;
    let rebuilds = 0;
    const list = ui.querySelector('ol')!;
    const observer = new MutationObserver(() => { rebuilds++; });
    observer.observe(list, { childList: true });
    window.editor.setHTML('<h2>Replacement 1</h2>');
    window.editor.setHTML('<h2>Replacement 2</h2>');
    const selection = window.editor.getSelection();
    oldButton.click();
    const staleStayed = JSON.stringify(selection) === JSON.stringify(window.editor.getSelection());
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    observer.disconnect();
    return { staleStayed, rebuilds, labels: [...ui.querySelectorAll('button')].map((button) => button.textContent) };
  })).toEqual({ staleStayed: true, rebuilds: 1, labels: ['Replacement 2'] });
});

test('focus callbacks cannot redirect an outline button into replacement or edited content or resurrect destroyed UI', async ({ page }) => {
  await initialize(page);
  await buttons(page).last().focus();
  await page.evaluate(() => window.editor.surface.addEventListener('focus', () => window.editor.setHTML('<h2>Replacement</h2>'), { once: true }));
  await page.keyboard.press('Enter');
  await expect(buttons(page)).toHaveText(['Replacement']);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.map((change) => change.source), undo: window.editor.canUndo() })))
    .toEqual({ html: '<h2>Replacement</h2>', changes: ['api'], undo: false });
  await buttons(page).first().focus();
  await page.evaluate(() => window.editor.surface.addEventListener('focus', () => window.outlineUI.destroy(), { once: true }));
  await page.keyboard.press('Enter');
  await expect(panel(page).locator('.mw-outline')).toHaveCount(0);
  expect(await page.evaluate(() => window.outlineErrors.length)).toBe(0);
});

test('invalid setup, detached and adopted hosts and retained disposed controls preserve editor ownership and independent instances', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const otherHost = document.createElement('div');
    document.body.append(otherHost);
    const other = window.outlineModule.createOutlineUI(otherHost, window.editor, { label: 'Independent' });
    const invalid = [null, { maxHeadings: 0 }, { maxHeadings: 501 }, { maxHeadings: 1.2 }, { maxHeadings: '3' }, { label: '\n' }, { html: 'unsafe' }, { onError: 1 }];
    const invalidRejected = invalid.every((options) => {
      const host = document.createElement('div'); document.body.append(host);
      try { window.outlineModule.createOutlineUI(host, window.editor, options as never); host.remove(); return false; }
      catch { const empty = !host.childNodes.length; host.remove(); return empty; }
    });
    const oldButton = window.outlineUI.element.querySelector('button')!;
    window.outlineHost.remove();
    const before = window.editor.getSelection();
    oldButton.click();
    const detached = JSON.stringify(before) === JSON.stringify(window.editor.getSelection());
    document.body.append(window.outlineHost);
    window.outlineUI.refresh();
    const adoptedButton = window.outlineUI.element.querySelector('button')!;
    const foreign = document.implementation.createHTMLDocument('Other');
    foreign.body.append(window.outlineHost);
    adoptedButton.click();
    const adopted = JSON.stringify(before) === JSON.stringify(window.editor.getSelection());
    window.outlineUI.destroy();
    oldButton.click();
    window.outlineUI.destroy();
    let refreshRejected = false;
    try { window.outlineUI.refresh(); } catch { refreshRejected = true; }
    const independent = other.element.isConnected && other.element.querySelectorAll('button').length === 2;
    window.editor.destroy();
    const editorCleanup = !other.element.isConnected;
    other.destroy(); otherHost.remove();
    return { invalidRejected, detached, adopted, refreshRejected, independent, editorCleanup };
  })).toEqual({ invalidRejected: true, detached: true, adopted: true, refreshRejected: true, independent: true, editorCleanup: true });
});

test('generic errors stay literal and diagnostic callbacks can destroy the module without later frame resurrection', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const original = window.editor.surface.querySelectorAll.bind(window.editor.surface);
    window.editor.surface.querySelectorAll = (() => { throw new Error('<img onerror=unsafe()>'); }) as typeof original;
    window.outlineUI.refresh();
    const generic = window.outlineUI.element.querySelector('[role=status]')!.textContent;
    const injected = window.outlineUI.element.querySelectorAll('img').length;
    window.outlineErrorAction = () => window.outlineUI.destroy();
    window.outlineUI.refresh();
    window.editor.surface.querySelectorAll = original;
    window.editor.setHTML('<h2>Later</h2>');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return { generic, injected, errors: window.outlineErrors.length, removed: !window.outlineUI.element.isConnected };
  })).toEqual({ generic: 'The outline could not be updated.', injected: 0, errors: 2, removed: true });
});
