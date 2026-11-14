import { expect, test } from '@playwright/test';

test('React StrictMode list block paste preserves controlled feedback, insertion caret and isolated history', async ({ page }) => {
  await page.goto('/?adapter=react');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  const original = '<ul><li><p title="Start">Alpha <strong>one</strong></p></li><li><h2 title="End"><em>Beta</em> tail</h2><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.changes.length = 0;
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('em')!.firstChild!, 2, root.querySelector('[title="Start"]')!.firstChild!, 6);
  }, original);
  const after = await content.locator('[title="After"]').elementHandle();
  const branch = await content.locator('[title="Branch"]').elementHandle();
  await page.evaluate(() => window.editor.insertHTML('<p><u>First</u></p><h3 title="Last">Last</h3>'));
  const inserted = '<ul><li><p title="Start">Alpha <u>First</u></p><h3 title="Last">Last<em>ta</em> tail</h3><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(inserted);
  expect(await page.evaluate(() => window.changes.map((change) => change.html))).toEqual([inserted]);
  for (const node of [after, branch]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await page.keyboard.type('X');
  await expect(content.locator('[title="Last"]')).toHaveText('LastXta tail');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('em')!.firstChild, offset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusOffset, undo: window.editor.canUndo() }))).toEqual({ anchor: true, offset: 2, focus: 6, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(inserted);
  await page.keyboard.type('!');
  await expect(content.locator('[title="Last"]')).toHaveText('Last!ta tail');
  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes, undo: false });
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
});
