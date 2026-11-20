import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
const initialize = async (page: Page, value: string) => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((html) => { window.editor.setHTML(html); window.editor.setSelection(0); }, value);
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

test('direct inline style commands retain backward rich selection through apply, reset and history', async ({ page }) => {
  const original = '<p>Alpha <em>Beta</em> tail</p>';
  await initialize(page, original);
  for (const name of ['color', 'background']) {
    await page.evaluate((original) => {
      window.editor.setHTML(original);
      const root = window.editor.surface;
      window.editor.focus();
      document.getSelection()!.setBaseAndExtent(root.querySelector('em')!.firstChild!, 2, root.querySelector('p')!.firstChild!, 2);
    }, original);
    await page.evaluate((name) => window.editor.format(name, '#123456'), name);
    const state = await page.evaluate(() => {
      const native = document.getSelection()!;
      const range = native.getRangeAt(0);
      return { text: native.toString(), backward: native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset };
    });
    expect(state).toEqual({ text: 'pha Be', backward: true });
    await page.evaluate((name) => window.editor.format(name, false), name);
    expect(await html(page)).toBe(original);
    expect(await page.evaluate(() => {
      const native = document.getSelection()!;
      const range = native.getRangeAt(0);
      return native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset;
    })).toBe(true);
    await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
    expect(await html(page)).toBe(original);
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
    await page.evaluate(() => window.editor.redo());
    expect(await page.evaluate(() => {
      const native = document.getSelection()!;
      const range = native.getRangeAt(0);
      return { text: native.toString(), backward: native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset };
    })).toEqual(state);
  }
});

test('partial colors preserve marks and independent highlights across blocks and cells', async ({ page }) => {
  await initialize(page, '<p><strong>abcd</strong></p><table><tbody><tr><td>ef</td></tr></tbody></table>');
  await page.evaluate(() => { window.editor.setSelection(1, 4); window.editor.format('color', '#ff0000'); window.editor.format('background', '#ffff00'); });
  expect((await page.locator('.mw-content strong').allTextContents()).join('')).toBe('abcd');
  expect(await page.locator('.mw-content table td').textContent()).toBe('ef');
  expect(await page.evaluate(() => window.editor.getFormats().color)).toBe('rgb(255, 0, 0)');
  await page.evaluate(() => window.editor.format('color', false));
  expect(await page.evaluate(() => window.editor.getFormats().color)).toBeUndefined();
  expect(await page.evaluate(() => window.editor.getFormats().background)).toBe('rgb(255, 255, 0)');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 1, length: 4 });
});

test('pending colors coexist with marks, stay compact, and undo together', async ({ page }) => {
  await initialize(page, '<p>Start </p>');
  await page.evaluate(() => { window.editor.setSelection(6); window.editor.format('color', 'red'); window.editor.format('background', 'yellow'); window.editor.format('bold', true); });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.keyboard.type('abcdef');
  await expect(page.locator('.mw-content')).toHaveText('Start abcdef');
  expect(await page.evaluate(() => window.editor.getFormats().color)).toBe('red');
  expect(await page.locator('.mw-content span').count()).toBeLessThan(6);
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.mw-content')).toHaveText('Start ');
});

test('disabling an inline color at a caret retains both neighbors and other styling', async ({ page }) => {
  await initialize(page, '<p><span style="color: red; background-color: yellow"><em>abcd</em></span></p>');
  await page.evaluate(() => { window.editor.setSelection(2); window.editor.format('color', false); });
  await page.keyboard.type('X');
  expect(await page.evaluate(() => window.editor.getText())).toBe('abXcd');
  const styles = await page.evaluate(() => { const walker = document.createTreeWalker(window.editor.surface, NodeFilter.SHOW_TEXT); let n; const result = []; while ((n = walker.nextNode())) { const el = n.parentElement!; result.push([n.textContent, getComputedStyle(el).color, getComputedStyle(el).backgroundColor]); } return result; });
  expect(styles.some(([text, color]) => text === 'X' && color !== 'rgb(255, 0, 0)')).toBe(true);
  await expect(page.locator('.mw-content em')).toHaveText(['ab', 'X', 'cd']);
});

test('invalid inline attributes reject atomically; mixed state, external reset and read-only work', async ({ page }) => {
  await initialize(page, '<p><span style="color:red">ab</span>cd</p>');
  const before = await html(page);
  await page.evaluate(() => window.editor.setSelection(0, 4));
  expect(await page.evaluate(() => window.editor.getFormats().mixed)).toContain('color');
  for (const value of ['red; width: 100px', 'var(--secret)', 'url(https://example.com)', 'notacolor']) {
    expect(await page.evaluate((color) => { try { window.editor.format('color', color); } catch { return true; } return false; }, value)).toBe(true);
    expect(await html(page)).toBe(before);
  }
  await page.evaluate(() => { window.editor.setReadOnly(true); window.editor.format('color', 'blue'); });
  expect(await html(page)).toBe(before);
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.setSelection(4); window.editor.format('color', 'blue'); window.editor.setHTML('<p>New</p>'); window.editor.setSelection(3); });
  expect(await page.evaluate(() => window.editor.getFormats().color)).toBeUndefined();
});

test('partial link replacement/unlink preserves neighboring anchors and cross-block structure', async ({ page }) => {
  await initialize(page, '<p><a href="/old"><strong>abcd</strong></a></p><p><a href="/other">efgh</a></p>');
  await page.evaluate(() => { window.editor.setSelection(2, 4); window.editor.format('link', { href: '/new', target: '_blank', title: 'Safe' }); });
  await expect(page.locator('.mw-content p')).toHaveCount(2);
  await expect(page.locator('.mw-content a a')).toHaveCount(0);
  await expect(page.locator('.mw-content a[href="/new"]')).toHaveText(['cd', 'ef']);
  await expect(page.locator('.mw-content a[href="/new"]').first()).toHaveAttribute('rel', 'noopener noreferrer');
  await page.evaluate(() => window.editor.format('link', false));
  await expect(page.locator('.mw-content a')).toHaveText(['ab', 'gh']);
  expect(await page.locator('.mw-content').textContent()).toBe('abcdefgh');
  await page.evaluate(() => window.editor.undo()); await expect(page.locator('.mw-content a[href="/new"]')).toHaveCount(2);
});

test('caret link edits retain metadata, content and selection; whole-anchor unlink is undoable', async ({ page }) => {
  await initialize(page, '<p><a href="/old" target="_blank" title="Keep"><strong>abcd</strong><img src="/logo.svg" alt="Logo"></a></p>');
  await page.evaluate(() => { window.editor.setSelection(2); window.editor.format('link', '/new'); });
  await expect(page.locator('.mw-content a')).toHaveAttribute('title', 'Keep');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  await page.evaluate(() => window.editor.format('link', { href: '/next', target: '_self', title: '' }));
  expect(await page.locator('.mw-content a').getAttribute('rel')).toBeNull();
  expect(await page.locator('.mw-content a').getAttribute('title')).toBeNull();
  await page.evaluate(() => window.editor.format('link', false));
  await expect(page.locator('.mw-content a')).toHaveCount(0); await expect(page.locator('.mw-content img')).toHaveCount(1);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  await page.evaluate(() => window.editor.undo()); await expect(page.locator('.mw-content a')).toHaveAttribute('href', '/next');
});

test('new label links escape text and leave subsequent typing outside the anchor', async ({ page }) => {
  await initialize(page, '<p><br></p>');
  await page.evaluate(() => window.editor.format('link', { href: '/safe', text: '<b>literal</b>', title: '" onclick="oops', target: '_blank' }));
  await expect(page.locator('.mw-content a')).toHaveText('<b>literal</b>'); await expect(page.locator('.mw-content b')).toHaveCount(0);
  await page.keyboard.type('after');
  await expect(page.locator('.mw-content a')).toHaveText('<b>literal</b>');
  expect(await page.evaluate(() => window.editor.getText())).toBe('<b>literal</b>after');
});

test('unsafe links fail before mutation and import enforces target and rel in HTML and JSON', async ({ page }) => {
  await initialize(page, '<p>abc</p>'); const before = await html(page);
  for (const value of [{ href: 'javascript:alert(1)' }, { href: '//evil' }, { href: '/ok', target: 'evil' }, { href: '/ok', text: '' }]) {
    expect(await page.evaluate((link) => { window.editor.setSelection(0, 2); try { window.editor.format('link', link); } catch { return true; } return false; }, value)).toBe(true);
    expect(await html(page)).toBe(before);
  }
  await page.evaluate(() => window.editor.setHTML('<p><a href="/safe" target="_blank" rel="opener external" onclick="evil()">Safe</a></p>'));
  await expect(page.locator('.mw-content a')).toHaveAttribute('rel', 'noopener noreferrer');
  await page.evaluate(() => window.editor.setJSON(window.editor.getJSON()));
  await expect(page.locator('.mw-content a')).toHaveAttribute('target', '_blank');
  expect(await page.locator('.mw-content a').getAttribute('onclick')).toBeNull();
});
