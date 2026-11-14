import { expect, test } from '@playwright/test';

test('React StrictMode feedback preserves rich multi-block paste, backward history and the next typing caret', async ({ page }) => {
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
  const keep = await content.locator('p').last().elementHandle();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/html', '<p><u>A</u></p><h3>B</h3>');
    data.setData('text/plain', 'Wrong plain text');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    window.editor.surface.dispatchEvent(event);
  });
  const replaced = '<p>Alpha <u>A</u></p><h3>B<em>ta</em> tail</h3><p>Keep</p>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), changes: window.changes.map((change) => change.html) }))).toEqual({ selection: { index: 8, length: 0 }, changes: [replaced] });
  expect(await keep!.evaluate((element) => element.isConnected && element === window.editor.surface.lastElementChild)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const root = window.editor.surface;
    return { anchorRight: selection.anchorNode === root.querySelector('h2 em')!.firstChild, anchorOffset: selection.anchorOffset, focusLeft: selection.focusNode === root.querySelector('p')!.firstChild, focusOffset: selection.focusOffset, selected: selection.getRangeAt(0).toString(), undo: window.editor.canUndo() };
  })).toEqual({ anchorRight: true, anchorOffset: 2, focusLeft: true, focusOffset: 6, selected: 'oneBe', undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 8, length: 0 });
  await page.keyboard.insertText('!');
  const typed = '<p>Alpha <u>A</u></p><h3>B!<em>ta</em> tail</h3><p>Keep</p>';
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(typed);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 9, length: 0 });
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.editor.getHTML())).toBe(original);
  const count = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click();
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await page.evaluate(() => window.editor.insertHTML('<p>Blocked</p><p>Paste</p>'));
  expect(await page.evaluate(() => window.changes.length)).toBe(count);
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(content).toHaveText('External update');
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: count, undo: false });
  await page.evaluate(() => window.dispose());
  await expect(content).toHaveCount(0);
});
