import { expect, test } from '@playwright/test';

test('React StrictMode repeated list block paste preserves existing quotes, controlled feedback and history', async ({ page }) => {
  await page.goto('/?adapter=react');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  const original = '<ul><li><blockquote title="Before">Before</blockquote><p title="Body">Alpha Beta</p><blockquote title="After"><p>After</p></blockquote><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.changes.length = 0;
    const root = window.editor.surface;
    const point = root.querySelector('[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, 6, point, 6);
  }, original);
  const handles = await Promise.all(['Before', 'After', 'Branch'].map((title) => content.locator(`[title="${title}"]`).elementHandle()));
  await page.evaluate(() => window.editor.insertHTML('<h3 title="Incoming">H</h3>'));
  const inserted = '<ul><li><blockquote title="Before">Before</blockquote><p title="Body">Alpha </p><h3 title="Incoming">H</h3><p title="Body">Beta</p><blockquote title="After"><p>After</p></blockquote><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(inserted);
  expect(await page.evaluate(() => window.changes.map((change) => change.html))).toEqual([inserted]);
  for (const node of handles) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => ({ suffix: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Incoming"]')!.nextElementSibling, offset: document.getSelection()!.anchorOffset }))).toEqual({ suffix: true, offset: 0 });
  await page.keyboard.type('X');
  await expect(content.locator('[title="Incoming"] + p')).toHaveText('XBeta');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ node: true, offset: 6, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(inserted);
  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes, undo: false });
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
});
