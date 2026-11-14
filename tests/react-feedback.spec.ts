import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

test('React acknowledgement preserves a subsequent parent layout-effect edit, caret and history', async ({ page }) => {
  await page.goto('/?adapter=react&feedback=layout');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');

  await page.evaluate(() => {
    window.editor.setSelection(window.editor.getText().length);
    window.editor.insertHTML('A');
  });

  await expect(content).toHaveText('Initial contentAB');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 17, length: 0 });
  expect(await page.evaluate(() => window.changes.map((change) => change.html))).toEqual([
    '<p>Initial contentA</p>',
    '<p>Initial contentAB</p>',
  ]);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(true);

  await page.evaluate(() => window.editor.undo());
  await expect(content).toHaveText('Initial contentA');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 16, length: 0 });
  await page.evaluate(() => window.editor.undo());
  await expect(content).toHaveText('Initial content');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);

  await page.evaluate(() => { window.editor.redo(); window.editor.redo(); });
  await expect(content).toHaveText('Initial contentAB');
  await page.keyboard.type('C');
  await expect(content).toHaveText('Initial contentABC');

  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => window.changes.length)).toBe(changes);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
  expect(await page.evaluate(() => {
    try { window.editor.getHTML(); return false; }
    catch { return true; }
  })).toBe(true);
});

test('React adapter imports and renders on the server without DOM or layout-effect warnings', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { createElement, StrictMode } from 'react';
    import { renderToString } from 'react-dom/server';
    import { MorfiraEditor } from '@morfira-dev/wysiwyg/react';
    const warnings = [];
    console.error = (...values) => warnings.push(values.join(' '));
    const html = renderToString(createElement(StrictMode, null,
      createElement(MorfiraEditor, { value: '<p>Server</p>' })));
    process.stdout.write(JSON.stringify({ html, warnings, browser: typeof window }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(output)).toEqual({ html: '<div class="mw-host"></div>', warnings: [], browser: 'undefined' });
});
