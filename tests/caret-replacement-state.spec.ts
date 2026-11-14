import { expect, test } from '@playwright/test';

for (const kind of ['blocks', 'items'] as const) test(`${kind} API replacement cannot revive a stale collapsed bold override at the same offset`, async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const original = kind === 'blocks'
    ? '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2><p>Keep</p>'
    : '<ul><li>Alpha <strong>one</strong></li><li><em>Beta</em> tail</li><li>Keep</li></ul>';
  await page.evaluate((html) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value: html, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
  }, original);
  const result = await page.evaluate((kind) => {
    const editor = window.editor;
    editor.setSelection(6);
    editor.format('bold', true);
    const pendingBefore = Boolean(editor.getFormats().bold);
    const root = editor.surface;
    const first = root.querySelector(kind === 'blocks' ? 'p' : 'li')!;
    const last = kind === 'blocks' ? root.querySelector('h2')! : root.querySelector('ul')!.children[1];
    // One synchronous turn intentionally avoids a selectionchange flush between
    // the earlier caret override and the direct DOM range used by an API caller.
    document.getSelection()!.setBaseAndExtent(last.querySelector('em')!.firstChild!, 2, first.firstChild!, 6);
    editor.insertHTML('<u></u>');
    return { pendingBefore, boldAfter: Boolean(editor.getFormats().bold), selection: editor.getSelection(), html: editor.getHTML(), changes: window.changes.length };
  }, kind);
  const replaced = kind === 'blocks'
    ? '<p>Alpha <u></u><em>ta</em> tail</p><p>Keep</p>'
    : '<ul><li>Alpha <u></u><em>ta</em> tail</li><li>Keep</li></ul>';
  expect(result).toEqual({ pendingBefore: true, boldAfter: false, selection: { index: 6, length: 0 }, html: replaced, changes: 1 });
  await page.keyboard.insertText('!');
  expect(await page.evaluate(() => ({ text: window.editor.getText(), selection: window.editor.getSelection(), bold: Boolean(window.editor.getFormats().bold) }))).toEqual({ text: 'Alpha !ta tailKeep', selection: { index: 7, length: 0 }, bold: false });
  await expect(page.locator('.mw-content strong')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), selection: window.editor.getSelection() }))).toEqual({ html: original, undo: false, selection: { index: 6, length: 5 } });
  expect(await page.evaluate((kind) => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    const first = root.querySelector(kind === 'blocks' ? 'p' : 'li')!;
    const last = kind === 'blocks' ? root.querySelector('h2')! : root.querySelector('ul')!.children[1];
    return { anchorRight: selection.anchorNode === last.querySelector('em')!.firstChild, anchorOffset: selection.anchorOffset, focusLeft: selection.focusNode === first.firstChild, focusOffset: selection.focusOffset };
  }, kind)).toEqual({ anchorRight: true, anchorOffset: 2, focusLeft: true, focusOffset: 6 });
});
