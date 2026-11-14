import { expect, test } from '@playwright/test';

test('React StrictMode retains nonfinal branch order and its first-body caret during controlled feedback', async ({ page }) => {
  await page.goto('/?adapter=react');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  const original = '<ul><li>Owner<ol title="Source"><li title="Current"><p><em>Alpha</em></p><h3>Body</h3></li><li>Following</li></ol><ul title="Later"><li>Later</li></ul></li><li>Outside</li></ul>';
  await page.evaluate((value) => {
    const editor = window.editor;
    editor.setHTML(value);
    window.changes.length = 0;
    editor.surface.focus();
    const node = editor.surface.querySelector('em')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(node, 0, node, 0);
  }, original);
  const later = await content.locator('[title="Later"]').elementHandle();
  const current = await content.locator('[title="Current"]').elementHandle();
  await page.keyboard.press('Backspace');
  const lifted = '<ul><li>Owner</li><li title="Current"><p><em>Alpha</em></p><h3>Body</h3><ol title="Source"><li>Following</li></ol><ul title="Later"><li>Later</li></ul></li><li>Outside</li></ul>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(lifted);
  expect(await page.evaluate(() => window.changes.map((change) => change.html))).toEqual([lifted]);
  for (const node of [later, current]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('em')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ node: true, offset: 0, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(lifted);
  await page.keyboard.insertText('X');
  await expect(content.locator('em')).toHaveText('XAlpha');
  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes, undo: false });
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
});
