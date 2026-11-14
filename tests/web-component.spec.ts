import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { MorfiraEditorElement } from '@morfira-dev/wysiwyg/web-component';

test.beforeEach(async ({ page }) => {
  await page.goto('/web-component.html');
  await expect(page.getByRole('textbox')).toHaveText('Initial content');
});

test('custom element registration is explicit, idempotent and rejects foreign names', async ({ page }) => {
  expect(await page.evaluate(() => {
    const define = window.webComponentHarness.define;
    const own = define();
    const same = define() === own;
    customElements.define('foreign-editor', class extends HTMLElement {});
    let foreign = false;
    try { define('foreign-editor'); }
    catch { foreign = true; }
    return { same, foreign, ready: window.webComponentHarness.ready };
  })).toEqual({ same: true, foreign: true, ready: 1 });
});

test('controlled custom-event feedback preserves caret/history and external replacement stays silent', async ({ page }) => {
  const content = page.getByRole('textbox');
  await page.evaluate(() => {
    window.editor.setSelection(15);
    document.body.addEventListener('value-change', (event) => {
      document.body.dataset.bubbled = String(event.bubbles && event.composed && (event as CustomEvent<string>).detail === '<p>Initial contentA</p>');
    }, { once: true });
  });
  await page.keyboard.type('A');
  await expect(content).toHaveText('Initial contentA');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 16, length: 0 });
  expect(await page.evaluate(() => window.webComponentHarness.values)).toEqual(['<p>Initial contentA</p>']);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await expect(page.locator('body')).toHaveAttribute('data-bubbled', 'true');
  await page.evaluate(() => window.editor.undo());
  await expect(content).toHaveText('Initial content');
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('B');
  await expect(content).toHaveText('Initial contentAB');
  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await page.evaluate(() => window.editor.insertHTML('blocked'));
  await expect(content).toHaveText('Initial contentAB');
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => window.changes.length)).toBe(changes);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('attributes, translations and custom labels update UI without content changes', async ({ page }) => {
  const content = page.getByRole('textbox');
  await page.getByRole('button', { name: 'Toggle locale', exact: true }).click();
  await expect(content).toHaveAttribute('aria-label', 'Текстовый редактор');
  await page.evaluate(() => {
    const element = window.webComponentHarness.element;
    element.translations = { 'editor.label': '<img src=x onerror=alert(1)>', 'editor.placeholder': 'Custom placeholder' };
  });
  await expect(content).toHaveAttribute('aria-label', '<img src=x onerror=alert(1)>');
  await expect(content).toHaveAttribute('data-placeholder', 'Custom placeholder');
  await expect(content.locator('img')).toHaveCount(0);
  await page.evaluate(() => {
    const element = window.webComponentHarness.element;
    element.setAttribute('label', 'App label');
    element.setAttribute('placeholder', 'App placeholder');
    element.setAttribute('locale', 'en-US');
    element.setAttribute('readonly', 'false');
  });
  await expect(content).toHaveAttribute('aria-label', 'App label');
  await expect(content).toHaveAttribute('data-placeholder', 'App placeholder');
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await page.evaluate(() => {
    const element = window.webComponentHarness.element;
    element.removeAttribute('label');
    element.removeAttribute('placeholder');
    element.removeAttribute('readonly');
  });
  await expect(content).toHaveAttribute('aria-label', '<img src=x onerror=alert(1)>');
  await expect(content).toHaveAttribute('contenteditable', 'true');
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('preconnection configuration and upgraded own properties become editor values', async ({ page }) => {
  const result = await page.evaluate(() => {
    const element = document.createElement('later-editor') as MorfiraEditorElement;
    element.value = '<p>Before upgrade</p>';
    element.locale = 'en';
    window.webComponentHarness.define('later-editor');
    customElements.upgrade(element);
    element.value = '<p>Configured</p>';
    const unrelated = document.createElement('span');
    unrelated.textContent = 'Not document data';
    element.append(unrelated);
    document.body.append(element);
    const editor = element.getEditor()!;
    const value = editor.getHTML();
    const label = editor.surface.getAttribute('aria-label');
    element.remove();
    return { value, label, unrelatedPreserved: element.contains(unrelated), disconnected: element.getEditor() === undefined };
  });
  expect(result).toEqual({ value: '<p>Configured</p>', label: 'Text editor', unrelatedPreserved: true, disconnected: true });
});

test('disconnect/reconnect preserves content, cleans plugins and rejects stale API calls', async ({ page }) => {
  const content = page.getByRole('textbox');
  await page.evaluate(() => window.editor.setSelection(15));
  await page.keyboard.type('!');
  await page.getByRole('button', { name: 'Unmount', exact: true }).click();
  await expect(content).toHaveCount(0);
  await expect(page.locator('.mw-table-menu')).toHaveCount(0);
  expect(await page.evaluate(() => ({ value: window.webComponentHarness.element.value, disconnected: window.webComponentHarness.element.getEditor() === undefined }))).toEqual({ value: '<p>Initial content!</p>', disconnected: true });
  expect(await page.evaluate(() => {
    try { window.editor.getHTML(); return false; }
    catch { return true; }
  })).toBe(true);
  await page.getByRole('button', { name: 'Remount', exact: true }).click();
  await expect(content).toHaveText('Initial content!');
  await expect(page.locator('.mw-table-menu')).toHaveCount(1);
  expect(await page.evaluate(() => window.webComponentHarness.ready)).toBe(2);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('invalid locale/value/plugin updates fail atomically on a connected element', async ({ page }) => {
  const result = await page.evaluate(() => {
    const element = window.webComponentHarness.element;
    let rejected = 0;
    for (const update of [
      () => { element.locale = 'not_a_locale'; },
      () => { element.translations = { 'editor.label': 1 } as unknown as Record<string, string>; },
      () => { element.value = {} as unknown as string; },
      () => { element.plugins = []; },
    ]) {
      try { update(); }
      catch { rejected++; }
    }
    return { rejected, locale: element.locale, html: element.value, changes: window.changes.length, undo: element.getEditor()!.canUndo() };
  });
  expect(result).toEqual({ rejected: 4, locale: 'en', html: '<p>Initial content</p>', changes: 0, undo: false });
});

test('Web Component public entry imports in Node without browser globals or registration', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { defineMorfiraEditor } from '@morfira-dev/wysiwyg/web-component';
    let rejected = false;
    try { defineMorfiraEditor(); } catch { rejected = true; }
    process.stdout.write(JSON.stringify({ type: typeof defineMorfiraEditor, rejected, window: typeof window, element: typeof HTMLElement }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(output)).toEqual({ type: 'function', rejected: true, window: 'undefined', element: 'undefined' });
});
