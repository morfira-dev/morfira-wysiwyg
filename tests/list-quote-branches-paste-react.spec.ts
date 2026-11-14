import { expect, test } from '@playwright/test';

test('React StrictMode quote paste preserves first/middle/last branches and both partial quotes, controlled feedback, caret and lifecycle', async ({ page }) => {
  await page.goto('/?adapter=react');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  const original = '<ul><li><blockquote title="Left" style="text-align: right"><p title="Start">AB</p></blockquote><p>Covered body</p><ul title="First branch"><li>First</li></ul></li><li><blockquote title="Middle">Middle</blockquote><ol title="Middle branch" start="3"><li><br></li></ol></li><li><blockquote title="Quote" style="text-align: center"><p title="Body">CD</p><h3 title="Keep">EF</h3></blockquote><p title="After">After</p><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.changes.length = 0;
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('[title="Body"]')!.firstChild!, 1, root.querySelector('[title="Start"]')!.firstChild!, 1);
  }, original);
  const nodes = await Promise.all(['Left', 'Start', 'Quote', 'Body', 'Keep', 'After', 'First branch', 'Middle branch', 'Branch'].map((title) => content.locator(`[title="${title}"]`).elementHandle()));
  await page.evaluate(() => window.editor.insertHTML('<h2 title="Incoming">H</h2>'));
  const inserted = '<ul><li><blockquote title="Left" style="text-align: right"><p title="Start">A</p></blockquote><h2 title="Incoming">H</h2><p><br></p><blockquote title="Quote" style="text-align: center"><p title="Body">D</p><h3 title="Keep">EF</h3></blockquote><p title="After">After</p><ul title="First branch"><li>First</li></ul><ol title="Middle branch" start="3"><li><br></li></ol><ol title="Branch"><li>Branch</li></ol></li></ul>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(inserted);
  expect(await page.evaluate(() => window.changes.map((change) => change.html))).toEqual([inserted]);
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => ({ suffix: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Incoming"]')!.nextElementSibling, offset: document.getSelection()!.anchorOffset }))).toEqual({ suffix: true, offset: 0 });
  await page.keyboard.insertText('X');
  await expect(content.locator('[title="Incoming"] + p')).toHaveText('X');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Body"]')!.firstChild, anchorOffset: document.getSelection()!.anchorOffset, focus: document.getSelection()!.focusNode === window.editor.surface.querySelector('[title="Start"]')!.firstChild, focusOffset: document.getSelection()!.focusOffset, undo: window.editor.canUndo() }))).toEqual({ anchor: true, anchorOffset: 1, focus: true, focusOffset: 1, undo: false });
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
