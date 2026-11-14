import { expect, test } from '@playwright/test';

test('React StrictMode caret list block insertion preserves controlled feedback, exact caret history and next input', async ({ page }) => {
  await page.goto('/?adapter=react');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  const original = '<ul><li><h2 title="Body">Alpha Beta</h2><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.changes.length = 0;
    const root = window.editor.surface;
    const point = root.querySelector('[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, 6, point, 6);
  }, original);
  const after = await content.locator('[title="After"]').elementHandle();
  const branch = await content.locator('[title="Branch"]').elementHandle();
  await page.evaluate(() => window.editor.insertHTML('<p><u>First</u></p><h3 title="Last">Last</h3>'));
  const inserted = '<ul><li><h2 title="Body">Alpha <u>First</u></h2><h3 title="Last">LastBeta</h3><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(inserted);
  expect(await page.evaluate(() => window.changes.map((change) => change.html))).toEqual([inserted]);
  for (const node of [after, branch]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.keyboard.type('X');
  await expect(content.locator('[title="Last"]')).toHaveText('LastXBeta');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => ({ body: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, collapsed: document.getSelection()!.isCollapsed, undo: window.editor.canUndo() }))).toEqual({ body: true, offset: 6, collapsed: true, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(inserted);
  await page.keyboard.type('!');
  await expect(content.locator('[title="Last"]')).toHaveText('Last!Beta');
  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes, undo: false });
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
});
