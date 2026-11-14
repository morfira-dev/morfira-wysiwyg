import { expect, test } from '@playwright/test';

test('React StrictMode first-body Backspace preserves controlled feedback, exact undo and subsequent typing', async ({ page }) => {
  await page.goto('/?adapter=react');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  const original = '<ul><li><h2>Previous</h2></li><li><p><em>Alpha</em></p><h3 title="Later">Later</h3><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.changes.length = 0;
    const root = window.editor.surface;
    root.focus();
    const node = root.querySelector('em')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(node, 0, node, 0);
  }, original);
  const later = await content.locator('h3').elementHandle();
  const branch = await content.locator('[title="Branch"]').elementHandle();
  await page.keyboard.press('Backspace');
  const merged = '<ul><li><h2>Previous<em>Alpha</em></h2><h3 title="Later">Later</h3><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(merged);
  expect(await page.evaluate(() => window.changes.map((change) => change.html))).toEqual([merged]);
  for (const node of [later, branch]) expect(await node!.evaluate((element) => element.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => ({ onText: document.getSelection()!.anchorNode === window.editor.surface.querySelector('em')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ onText: true, offset: 0, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(merged);
  await page.keyboard.type('X');
  await expect(content.locator('h2')).toHaveText('PreviousXAlpha');
  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes, undo: false });
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
});
