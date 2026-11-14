import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, value: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    window.editor.focus();
  }, value);
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

test('paste starting at an empty marked placeholder retains its source context and exact empty bookmark', async ({ page }) => {
  const original = '<p><strong><br></strong></p><h2><em>Beta</em> tail</h2><p>Keep</p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p strong')!, 0, root.querySelector('h2 em')!.firstChild!, 2);
    window.editor.insertHTML('X');
  });
  const replaced = '<p><strong>X</strong><em>ta</em> tail</p><p>Keep</p>';
  expect(await html(page)).toBe(replaced);
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ selection: { index: 1, length: 0 }, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => ({ inStrong: document.getSelection()!.anchorNode === window.editor.surface.querySelector('strong'), offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ inStrong: true, offset: 0, undo: false });
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.insertText('Y');
  expect(await html(page)).toBe('<p><strong>XY</strong><em>ta</em> tail</p><p>Keep</p>');
});

test('paste respects real br element endpoints and restores a backwards range after isolated next input', async ({ page }) => {
  const original = '<p>A<br>Selected</p><h2><em>Beta</em><br>tail</h2><p>Keep</p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('h2')!, 1, root.querySelector('p')!, 2);
    window.editor.insertHTML('<em>X</em>Y');
  });
  const replaced = '<p>A<br><em>X</em>Y<br>tail</p><p>Keep</p>';
  expect(await html(page)).toBe(replaced);
  await page.keyboard.insertText('Z');
  expect(await html(page)).toBe('<p>A<br><em>X</em>YZ<br>tail</p><p>Keep</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(replaced);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return { anchorRight: selection.anchorNode === root.querySelector('h2'), anchorOffset: selection.anchorOffset, focusLeft: selection.focusNode === root.querySelector('p'), focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
  })).toEqual({ anchorRight: true, anchorOffset: 1, focusLeft: true, focusOffset: 2, undo: false });
});

test('a final image-only payload paragraph receives the suffix without a spurious placeholder break', async ({ page }) => {
  const original = '<p>Alpha one</p><h2><em>Beta</em> tail</h2><p>Keep</p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!.firstChild!, 6, root.querySelector('h2 em')!.firstChild!, 2);
    window.editor.insertHTML('<p>First</p><p><img src="https://example.test/a.png" alt="A"></p>');
  });
  const replaced = '<p>Alpha First</p><p><img src="https://example.test/a.png" alt="A"><em>ta</em> tail</p><p>Keep</p>';
  expect(await html(page)).toBe(replaced);
  await expect(page.locator('.mw-content br')).toHaveCount(0);
  await page.keyboard.insertText('X');
  expect(await html(page)).toBe('<p>Alpha First</p><p><img src="https://example.test/a.png" alt="A">X<em>ta</em> tail</p><p>Keep</p>');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(original);
});
