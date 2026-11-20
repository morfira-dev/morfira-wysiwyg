import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PrintTestOptions } from './print.types.js';
import './print.types.js';

const surface = (page: Page) => page.locator('[data-mw-print-surface]');
const panel = (page: Page) => page.locator('.print-test-host');
const initialize = async (page: Page, options: PrintTestOptions = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, css }) => {
    window.dispose();
    const path = '/packages/wysiwyg/dist/ui/print.js';
    window.printModule = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/print');
    const stylesheet = document.createElement('link');
    if (css) {
      stylesheet.rel = 'stylesheet';
      stylesheet.href = '/packages/plugins/dist/ui/print.css';
      await new Promise<void>((resolve, reject) => {
        stylesheet.onload = () => resolve();
        stylesheet.onerror = () => reject(new Error('Missing print stylesheet'));
        document.head.append(stylesheet);
      });
    }
    const mount = document.createElement('div');
    mount.className = 'print-editor';
    const host = document.createElement('div');
    host.className = 'print-test-host';
    document.body.prepend(mount, host);
    const nativePrint = window.print;
    window.printCalls = 0;
    window.printErrors = [];
    window.printAction = undefined;
    window.printErrorAction = undefined;
    window.print = () => { window.printCalls++; window.printAction?.(); };
    window.changes = [];
    window.editor = window.createEditor(mount, { value, locale: 'en', onChange: (change) => window.changes.push(change) });
    window.editor.focus();
    window.editor.setSelection(1);
    window.printHost = host;
    window.printUI = window.printModule.createPrintUI(host, window.editor, {
      onError: (error) => { window.printErrors.push(error); window.printErrorAction?.(); },
    });
    window.dispose = () => {
      window.printUI.destroy();
      window.editor.destroy();
      window.print = nativePrint;
      mount.remove(); host.remove(); stylesheet.remove();
    };
  }, { value: options.value ?? '<p>Alpha <strong>bold</strong></p>', css: options.css ?? true });
};

test('printing retains source nodes, backward selection and history while print media shows only a validated rich snapshot', async ({ page }) => {
  await initialize(page, { value: '<h2>Heading</h2><p>Text <strong>bold</strong></p><ul><li>Item</li></ul><table><caption>Caption</caption><tbody><tr><th scope="col">Head</th><td colspan="2">Merged</td></tr></tbody></table>' });
  const source = await page.locator('.print-editor strong').elementHandle();
  const before = await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 4, text, 1);
    return { html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, undo: window.editor.canUndo() };
  });
  await panel(page).getByRole('button', { name: 'Print', exact: true }).click();
  await expect(surface(page)).toBeHidden();
  await expect(surface(page).locator('h2')).toHaveText('Heading');
  await expect(surface(page).locator('td')).toHaveAttribute('colspan', '2');
  await expect(surface(page).locator('caption')).toHaveText('Caption');
  expect(await source!.evaluate((node) => node === window.editor.surface.querySelector('strong'))).toBe(true);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual(before);
  await page.emulateMedia({ media: 'print' });
  await expect(surface(page)).toBeVisible();
  await expect(page.locator('.print-editor')).toBeHidden();
  await expect(panel(page)).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(surface(page)).toHaveCount(0);
  await expect(page.locator('.print-editor')).toBeVisible();
  expect(await page.evaluate(() => ({ calls: window.printCalls, pending: window.printUI.isPrinting(), marker: document.body.hasAttribute('data-mw-print-active') })))
    .toEqual({ calls: 1, pending: false, marker: false });
});

test('print snapshots omit images, font families and link resources without making additional requests', async ({ page }) => {
  let requests = 0;
  await page.route('**/print-probe.png', async (route) => { requests++; await route.abort(); });
  await initialize(page, { value: '<p style="font-family: CustomPrintFont; color: red"><a href="/must-not-navigate" target="_blank">Link</a></p><figure><img src="/print-probe.png" alt="&lt;img onerror=bad()&gt;"><figcaption>Caption</figcaption></figure>' });
  await expect.poll(() => requests).toBe(1);
  expect(await page.evaluate(() => window.printUI.print())).toBe(true);
  await expect(surface(page).locator('img,source,script,iframe')).toHaveCount(0);
  await expect(surface(page).locator('.mw-preview-image')).toHaveText('<img onerror=bad()>');
  await expect(surface(page).locator('a')).not.toHaveAttribute('href');
  await expect(surface(page).locator('a')).not.toHaveAttribute('target');
  expect(await surface(page).locator('p').first().evaluate((node) => [node.style.fontFamily, node.style.color])).toEqual(['', 'red']);
  await page.emulateMedia({ media: 'print' });
  expect(await surface(page).evaluate((node) => getComputedStyle(node).fontFamily)).toContain('system-ui');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  expect(requests).toBe(1);
  expect(await page.evaluate(() => window.editor.surface.querySelector('p')!.style.fontFamily)).toBe('CustomPrintFont');
});

test('missing CSS and native print failures release ownership and expose only generic recoverable errors', async ({ page }) => {
  await initialize(page, { css: false });
  expect(await page.evaluate(() => window.printUI.print())).toBe(false);
  await expect(surface(page)).toHaveCount(0);
  expect(await page.evaluate(() => ({ calls: window.printCalls, errors: window.printErrors.length, marker: document.body.hasAttribute('data-mw-print-active') })))
    .toEqual({ calls: 0, errors: 1, marker: false });
  await expect(panel(page).getByRole('status')).toContainText('Unable to prepare printing');
  await initialize(page);
  expect(await page.evaluate(() => {
    window.printAction = () => { throw new Error('<backend secret>'); };
    window.printErrorAction = () => { throw new Error('Diagnostics failure'); };
    return window.printUI.print();
  })).toBe(false);
  await expect(panel(page).getByRole('status')).not.toContainText('backend secret');
  await expect(surface(page)).toHaveCount(0);
  expect(await page.evaluate(() => {
    window.printAction = () => window.dispatchEvent(new Event('afterprint'));
    return { accepted: window.printUI.print(), pending: window.printUI.isPrinting(), marker: document.body.hasAttribute('data-mw-print-active') };
  })).toEqual({ accepted: true, pending: false, marker: false });
});

test('one document lease isolates instances and never overwrites foreign markers or surfaces', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const host = document.createElement('div'); document.body.append(host);
    const other = window.printModule.createPrintUI(host, window.editor);
    const first = window.printUI.print();
    const blocked = !other.print();
    window.printUI.cancel();
    const next = other.print();
    window.dispatchEvent(new Event('afterprint'));
    const clean = !other.isPrinting() && !window.printUI.isPrinting();
    document.body.setAttribute('data-mw-print-active', 'foreign');
    const foreignBlocked = !window.printUI.print();
    other.cancel();
    const retained = document.body.getAttribute('data-mw-print-active');
    document.body.removeAttribute('data-mw-print-active');
    const foreign = document.createElement('section'); foreign.className = 'mw-print-surface'; document.body.append(foreign);
    const foreignSurfaceBlocked = !window.printUI.print();
    const untouched = foreign.isConnected;
    foreign.remove();
    window.printUI.print();
    document.body.setAttribute('data-mw-print-active', 'application-new');
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const released = !window.printUI.isPrinting() && document.body.getAttribute('data-mw-print-active') === 'application-new';
    document.body.removeAttribute('data-mw-print-active');
    other.destroy(); host.remove();
    return { first, blocked, next, clean, foreignBlocked, retained, foreignSurfaceBlocked, untouched, released };
  })).toEqual({ first: true, blocked: true, next: true, clean: true, foreignBlocked: true, retained: 'foreign', foreignSurfaceBlocked: true, untouched: true, released: true });
});

test('readonly permits printing and composition resets recover while pending snapshots stay immutable through external changes and locale', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = window.printUI.print();
    window.editor.setReadOnly(true);
    return { composing, readonly: window.printUI.print() };
  })).toEqual({ composing: false, readonly: true });
  const original = await surface(page).textContent();
  await page.evaluate(() => { window.editor.setHTML('<p>External baseline</p>'); window.editor.setLocale('ru'); });
  expect(await surface(page).textContent()).toBe(original);
  await expect(panel(page).getByRole('button', { name: 'Отменить', exact: true })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Отменить', exact: true }).click();
  expect(await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setHTML('<p>Another baseline</p>');
    return window.printUI.print();
  })).toBe(true);
  await expect(surface(page)).toHaveText('Another baseline');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(await page.evaluate(() => window.changes.map((change) => change.source))).toEqual(['api', 'api']);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('ownership loss, reentrant snapshot disposal and retained controls cannot leak or resurrect a print session', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    window.printUI.print();
    window.printHost.remove();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const detached = !window.printUI.isPrinting() && !window.printUI.print();
    document.body.append(window.printHost);
    window.printUI.print();
    const root = window.editor.surface;
    const parent = root.parentNode!;
    document.body.append(root);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const movedRoot = !window.printUI.isPrinting() && !window.printUI.print();
    parent.appendChild(root);
    const read = window.editor.getJSON;
    window.editor.getJSON = () => { window.printUI.destroy(); return read(); };
    const canceled = !window.printUI.print();
    window.editor.getJSON = read;
    const marker = document.body.hasAttribute('data-mw-print-active');
    const count = document.querySelectorAll('[data-mw-print-surface]').length;
    let rejected = false;
    try { window.printUI.print(); } catch { rejected = true; }
    window.printUI.destroy();
    return { detached, movedRoot, canceled, marker, count, rejected };
  })).toEqual({ detached: true, movedRoot: true, canceled: true, marker: false, count: 0, rejected: true });
  await initialize(page);
  expect(await page.evaluate(() => {
    const button = window.printUI.element.querySelector('button')!;
    window.printUI.print();
    window.editor.destroy();
    const calls = window.printCalls;
    button.click();
    return { noNewPrint: window.printCalls === calls, surface: document.querySelectorAll('[data-mw-print-surface]').length,
      marker: document.body.hasAttribute('data-mw-print-active'), ui: window.printHost.childNodes.length };
  })).toEqual({ noNewPrint: true, surface: 0, marker: false, ui: 0 });
});

test('invalid setup is atomic and the public print factory imports without browser globals', async ({ page }) => {
  const result = execFileSync(process.execPath, ['--input-type=module', '--eval', "const m = await import('./packages/wysiwyg/dist/ui/print.js'); if (typeof document !== 'undefined' || typeof m.createPrintUI !== 'function') throw new Error('Not SSR safe');"], { cwd: process.cwd(), encoding: 'utf8' });
  expect(result).toBe('');
  await initialize(page);
  expect(await page.evaluate(() => {
    const host = document.createElement('div'); document.body.append(host);
    const invalid = [{ label: '' }, { label: 'a\n' }, { label: 'x'.repeat(161) }, { onError: true }, { images: 'load' }];
    const rejected = invalid.every((options) => {
      try { window.printModule.createPrintUI(host, window.editor, options as never); return false; }
      catch { return host.childNodes.length === 0; }
    });
    const detached = document.createElement('div');
    let missing = false;
    try { window.printModule.createPrintUI(detached, window.editor); } catch { missing = true; }
    host.remove();
    return { rejected, missing, undo: window.editor.canUndo(), changes: window.changes.length };
  })).toEqual({ rejected: true, missing: true, undo: false, changes: 0 });
});
