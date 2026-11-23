import { expect, test } from '@playwright/test';

test('React StrictMode quote boundary deletion preserves actual neighbors, controlled caret, history and external replacement', async ({ page }) => {
  await page.goto('/?adapter=react');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  const original = '<ul><li><blockquote title="Quote" dir="rtl"><p title="Left"><strong>A😀</strong></p></blockquote><h3 title="Right"><em>Б</em></h3><p title="After">After</p><ol title="Branch"><li>Nested</li></ol></li><li>Other</li></ul>';
  const joined = '<ul><li><blockquote title="Quote" dir="rtl"><p title="Left"><strong>A😀</strong><em>Б</em></p></blockquote><p title="After">After</p><ol title="Branch"><li>Nested</li></ol></li><li>Other</li></ul>';
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.changes.length = 0;
    window.editor.focus();
    const body = window.editor.surface.querySelector('[title="Right"]')!;
    document.getSelection()!.setBaseAndExtent(body, 0, body, 0);
  }, original);
  const titles = ['Quote', 'Left', 'After', 'Branch'];
  const nodes = await Promise.all(titles.map((title) => content.locator(`[title="${title}"]`).elementHandle()));
  await page.keyboard.press('Backspace');
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(joined);
  expect(await page.evaluate(() => ({ changes: window.changes.map((change) => change.html), selection: window.editor.getSelection(),
    exactNode: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Left"]'), offset: document.getSelection()!.anchorOffset })))
    .toEqual({ changes: [joined], selection: { index: 3, length: 0 }, exactNode: true, offset: 1 });
  for (let index = 0; index < nodes.length; index++)
    expect(await nodes[index]!.evaluate((node, title) => node.isConnected && node === window.editor.surface.querySelector(`[title="${title}"]`), titles[index])).toBe(true);
  await page.keyboard.type('X');
  await expect(content.locator('[title="Left"]')).toHaveText('A😀XБ');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 4, length: 0 });
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(joined);
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(),
    exactNode: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Right"]'), offset: document.getSelection()!.anchorOffset })))
    .toEqual({ undo: false, exactNode: true, offset: 0 });
  await page.evaluate(() => window.editor.redo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(joined);
  await page.evaluate(() => window.editor.redo());
  await expect(content.locator('[title="Left"]')).toHaveText('A😀XБ');
  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await page.evaluate(() => {
    window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
  });
  await expect(content.locator('[title="Left"]')).toHaveText('A😀XБ');
  expect(await page.evaluate(() => window.changes.length)).toBe(changes);
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes, undo: false });
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
});
