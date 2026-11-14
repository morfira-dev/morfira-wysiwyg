import { expect, test } from '@playwright/test';

test('React StrictMode inner-quote block paste in an interleaved item retains outer order, actual nodes, controlled feedback and suffix typing history', async ({ page }) => {
  await page.goto('/?adapter=react');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  const original = '<ul><li title="Owner"><p title="Before">Before</p><ul title="Prefix branch"><li>Prefix</li></ul><h3 title="Before quote">After prefix branch</h3><blockquote title="Quote" style="text-align: right"><p title="Body">Alpha Beta</p><h3 title="Keep">Keep</h3></blockquote><ol title="Following branch" start="4"><li><br></li></ol><p title="Outside">After</p><ul title="Tail"><li>Tail</li></ul></li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.changes.length = 0;
    const root = window.editor.surface;
    const point = root.querySelector('[title="Body"]')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(point, 6, point, 6);
  }, original);
  const nodes = await Promise.all(['Owner', 'Before', 'Prefix branch', 'Before quote', 'Quote', 'Keep', 'Following branch', 'Outside', 'Tail'].map((title) => content.locator(`[title="${title}"]`).elementHandle()));
  await page.evaluate(() => window.editor.insertHTML('<h2 title="Incoming">H</h2>'));
  const inserted = '<ul><li title="Owner"><p title="Before">Before</p><ul title="Prefix branch"><li>Prefix</li></ul><h3 title="Before quote">After prefix branch</h3><blockquote title="Quote" style="text-align: right"><p title="Body">Alpha </p><h2 title="Incoming">H</h2><p title="Body">Beta</p><h3 title="Keep">Keep</h3></blockquote><ol title="Following branch" start="4"><li><br></li></ol><p title="Outside">After</p><ul title="Tail"><li>Tail</li></ul></li></ul>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(inserted);
  expect(await page.evaluate(() => window.changes.map((change) => change.html))).toEqual([inserted]);
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await content.locator('[title="Owner"]').evaluate((node) => [...node.children].map((child) => child.getAttribute('title')))).toEqual(['Before', 'Prefix branch', 'Before quote', 'Quote', 'Following branch', 'Outside', 'Tail']);
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
