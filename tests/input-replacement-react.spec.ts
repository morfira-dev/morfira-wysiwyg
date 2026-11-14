import { expect, test } from '@playwright/test';

test('React StrictMode controlled feedback preserves backward replacement, exact undo range and subsequent typing', async ({ page }) => {
  await page.goto('/?adapter=react');
  const content = page.getByRole('textbox');
  await expect(content).toHaveText('Initial content');
  const original = '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2><p>Keep</p>';
  await page.evaluate((html) => window.editor.setHTML(html), original);
  await expect(content).toHaveText('Alpha oneBeta tailKeep');
  await page.evaluate(() => {
    window.changes.length = 0;
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('h2 em')!.firstChild!, 2, root.querySelector('p')!.firstChild!, 6);
  });
  const untouched = await content.locator('p').last().elementHandle();
  await page.keyboard.type('X');
  const replaced = '<p>Alpha X<em>ta</em> tail</p><p>Keep</p>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.map((change) => change.html) }))).toEqual({ html: replaced, selection: { index: 7, length: 0 }, changes: [replaced] });
  expect(await untouched!.evaluate((element) => element.isConnected && element === window.editor.surface.lastElementChild)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const root = window.editor.surface;
    return {
      anchorIsRight: selection.anchorNode === root.querySelector('h2 em')!.firstChild,
      anchorOffset: selection.anchorOffset,
      focusIsLeft: selection.focusNode === root.querySelector('p')!.firstChild,
      focusOffset: selection.focusOffset,
      text: selection.getRangeAt(0).toString(),
      undo: window.editor.canUndo(),
    };
  })).toEqual({ anchorIsRight: true, anchorOffset: 2, focusIsLeft: true, focusOffset: 6, text: 'oneBe', undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 7, length: 0 });
  await page.keyboard.type('!');
  const typed = '<p>Alpha X!<em>ta</em> tail</p><p>Keep</p>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(typed);
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes, undo: false });
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
});
