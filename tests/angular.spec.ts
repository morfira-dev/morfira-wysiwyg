import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

for (const mode of ['controlled', 'form', 'model']) test(`Angular ${mode} binding preserves feedback, history, locale and unmount`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/angular.html?mode=${mode}`);
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  await expect(content).toHaveAttribute('aria-label', 'Text editor');
  await page.evaluate(() => window.editor.setSelection(15));
  await page.keyboard.type('A');
  await expect(content).toHaveText('Initial contentA');
  await expect.poll(() => page.evaluate(() => window.angularHarness.value())).toBe('<p>Initial contentA</p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 16, length: 0 });
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  if (mode === 'form') expect(await page.evaluate(() => window.angularHarness.formChanges())).toBe(1);
  await page.evaluate(() => window.editor.undo());
  await expect(content).toHaveText('Initial content');
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('B');
  await expect(content).toHaveText('Initial contentAB');

  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle locale', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.editor.getLocale().locale)).toBe('ru');
  await expect(content).toHaveAttribute('aria-label', 'Текстовый редактор');
  await page.getByRole('button', { name: 'Override label', exact: true }).click();
  await expect(content).toHaveAttribute('aria-label', 'Angular custom label');
  await expect(content).toHaveText('Initial contentAB');
  expect(await page.evaluate(() => window.changes.length)).toBe(changes);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(true);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await page.evaluate(() => window.editor.insertHTML('blocked'));
  await expect(content).toHaveText('Initial contentAB');
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => window.changes.length)).toBe(changes);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);

  await page.getByRole('button', { name: 'Unmount', exact: true }).click();
  await expect(content).toHaveCount(0);
  expect(await page.evaluate(() => window.angularHarness.detachedEditor())).toBeUndefined();
  await expect(page.locator('.mw-table-menu')).toHaveCount(0);
  expect(await page.evaluate(() => window.angularHarness.getEditor())).toBeUndefined();
  expect(await page.evaluate(() => {
    try { window.editor.getHTML(); return false; }
    catch { return true; }
  })).toBe(true);
  await page.getByRole('button', { name: 'Remount', exact: true }).click();
  await expect(content).toHaveText('External update');
  await expect(page.locator('.mw-table-menu')).toHaveCount(1);
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.angularHarness.errors())).toEqual([]);
});

test('Angular clears the captured component API even when a plugin disposer throws', async ({ page }) => {
  await page.goto('/angular.html?throw-dispose');
  await expect(page.getByRole('textbox')).toHaveText('Initial content');
  await page.getByRole('button', { name: 'Unmount', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.locator('.mw-table-menu')).toHaveCount(0);
  expect(await page.evaluate(() => window.angularHarness.detachedEditor())).toBeUndefined();
  expect(await page.evaluate(() => {
    try { window.editor.getHTML(); return false; }
    catch { return true; }
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => window.angularHarness.errors())).toEqual(['Error: Expected Angular dispose failure']);
});

test('Angular reactive forms disabled and touched combine with readOnly without feedback', async ({ page }) => {
  await page.goto('/angular.html?mode=form');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  expect(await page.evaluate(() => window.angularHarness.touched())).toBe(false);
  await content.focus();
  await page.getByRole('button', { name: 'Outside', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.angularHarness.touched())).toBe(true);
  await page.getByRole('button', { name: 'Toggle disabled', exact: true }).click();
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle disabled', exact: true }).click();
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await expect(content).toHaveAttribute('contenteditable', 'true');
  await page.evaluate(() => window.editor.setSelection(15));
  await page.keyboard.type('!');
  await expect.poll(() => page.evaluate(() => window.angularHarness.value())).toBe('<p>External update!</p>');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
});

test('Angular AOT server rendering keeps browser DOM absent and does not create an editor', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { render } from './artifacts/angular/server.mjs';
    const html = await render();
    process.stdout.write(JSON.stringify({ html, window: typeof window, document: typeof document }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  const result = JSON.parse(output) as { html: string; window: string; document: string };
  expect(result.html).toContain('class="mw-host"');
  expect(result.html).not.toContain('mw-content');
  expect(result.window).toBe('undefined');
  expect(result.document).toBe('undefined');
});
