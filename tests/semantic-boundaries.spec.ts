import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const nodes: SchemaNodeSpec[] = [
  { name: 'test:heading', kind: 'block', tag: 'h2', attributes: { 'data-id': { type: 'text', required: true } } },
  { name: 'test:paragraph', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } },
  { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } },
];

const initialize = async (page: Page, html: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ html, nodes }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value: html, schema: nodes, onChange: (change) => window.changes.push(change) });
  }, { html, nodes });
};

test('Enter exits a registered heading without invalid marker/tag metadata or event errors', async ({ page }) => {
  const original = '<h2 style="text-align: center" data-mw-node="test:heading" data-id="title">Title</h2><p>Keep</p>';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page, original);
  await page.evaluate(() => window.editor.setSelection(5));
  await page.evaluate(() => Reflect.set(window, 'semanticKeep', window.editor.surface.lastElementChild));
  await page.keyboard.press('Enter');
  expect(errors).toEqual([]);
  const result = '<h2 style="text-align: center" data-mw-node="test:heading" data-id="title">Title</h2><p style="text-align: center"><br></p><p>Keep</p>';
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(result);
  expect(await page.evaluate(() => ({ changes: window.changes.length, sameKeep: window.editor.surface.lastElementChild === Reflect.get(window, 'semanticKeep') }))).toEqual({ changes: 1, sameKeep: true });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ selection: { index: 5, length: 0 }, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(result);
  await page.keyboard.type('Body');
  await expect(page.locator('.mw-content > p').first()).toHaveText('Body');
  await expect(page.locator('.mw-content > h2')).toHaveText('Title');
});

test('empty registered heading remains intact while Enter creates an ordinary editable sibling', async ({ page }) => {
  const original = '<h2 style="text-align: right" data-mw-node="test:heading" data-id="empty"><br></h2><p>Keep</p>';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    const heading = root.querySelector('h2')!;
    root.focus();
    const range = document.createRange();
    range.selectNodeContents(heading);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  expect(await page.evaluate(() => document.getSelection()!.anchorNode === window.editor.surface.querySelector('h2'))).toBe(true);
  await page.keyboard.press('Enter');
  const result = '<h2 style="text-align: right" data-mw-node="test:heading" data-id="empty"><br></h2><p style="text-align: right"><br></p><p>Keep</p>';
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(result);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => document.getSelection()!.anchorNode === window.editor.surface.querySelector('h2'))).toBe(true);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('Body');
  await expect(page.locator('.mw-content > p').first()).toHaveText('Body');
  await expect(page.locator('.mw-content > h2')).toHaveAttribute('data-id', 'empty');
  await expect(page.locator('.mw-content > h2')).toHaveText('');
});

for (const tag of ['h2', 'p'] as const) test(`interior Enter preserves registered ${tag} metadata and rich suffix through undo and following typing`, async ({ page }) => {
  const name = tag === 'h2' ? 'test:heading' : 'test:paragraph';
  const original = `<${tag} data-mw-node="${name}" data-id="split"><strong>abCD</strong><em>ef</em></${tag}><p>Keep</p>`;
  await initialize(page, original);
  await page.evaluate(() => window.editor.setSelection(2));
  await page.keyboard.press('Enter');
  const result = `<${tag} data-mw-node="${name}" data-id="split"><strong>ab</strong></${tag}><${tag} data-mw-node="${name}" data-id="split"><strong>CD</strong><em>ef</em></${tag}><p>Keep</p>`;
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(result);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('X');
  await expect(page.locator(`.mw-content > ${tag}`).nth(1)).toHaveText('XCDef');
});

test('Shift Enter retains registered block and inline metadata with exact redo caret', async ({ page }) => {
  const original = '<h2 data-mw-node="test:heading" data-id="title"><span data-mw-node="test:reference" data-id="ref">ab</span></h2><p>Keep</p>';
  await initialize(page, original);
  await page.evaluate(() => window.editor.setSelection(2));
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.mw-content > h2')).toHaveCount(1);
  await expect(page.locator('.mw-content > h2')).toHaveAttribute('data-id', 'title');
  await expect(page.locator('.mw-content [data-id="ref"]')).toHaveText('ab');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  const result = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(result);
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content > h2')).toHaveText('abX');
  expect(await page.evaluate(() => window.editor.getHTML())).toContain('<br>X');
});

for (const key of ['Backspace', 'Delete'] as const) test(`${key} cannot join a registered leaf with an ordinary or registered neighbor`, async ({ page }) => {
  const semantic = '<h2 data-mw-node="test:heading" data-id="title">Title</h2>';
  const other = '<p data-mw-node="test:paragraph" data-id="other">Other</p>';
  for (const pair of [[semantic, '<p>Body</p>'], ['<p>Body</p>', semantic], [semantic, other]]) {
    const original = pair.join('');
    await initialize(page, original);
    await page.evaluate((key) => {
      const root = window.editor.surface;
      const block = key === 'Backspace' ? root.lastElementChild! : root.firstElementChild!;
      root.focus();
      const range = document.createRange();
      range.selectNodeContents(block);
      range.collapse(key === 'Backspace');
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }, key);
    const beforeSelection = await page.evaluate(() => window.editor.getSelection());
    await page.keyboard.press(key);
    expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
    expect(await page.evaluate(() => window.editor.getSelection())).toEqual(beforeSelection);
    expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), redo: window.editor.canRedo() }))).toEqual({ changes: 0, undo: false, redo: false });
  }
});

test('beforeinput-only heading exit uses the same validated history while canceled input is untouched', async ({ page }) => {
  const original = '<h2 data-mw-node="test:heading" data-id="title">Title</h2>';
  await initialize(page, original);
  await page.evaluate(() => window.editor.setSelection(5));
  const canceled = await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
    event.preventDefault();
    window.editor.surface.dispatchEvent(event);
    return window.editor.getHTML();
  });
  expect(canceled).toBe(original);
  const prevented = await page.evaluate(() => !window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true })));
  expect(prevented).toBe(true);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(`${original}<p><br></p>`);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('semantic Enter preserves composition and read-only mutation guards', async ({ page }) => {
  const original = '<h2 data-mw-node="test:heading" data-id="title">Title</h2>';
  await initialize(page, original);
  await page.evaluate(() => window.editor.setSelection(5));
  expect(await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { inputType: 'insertParagraph', isComposing: true, bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(event);
    return { html: window.editor.getHTML(), prevented: event.defaultPrevented, changes: window.changes.length };
  })).toEqual({ html: original, prevented: false, changes: 0 });
  await page.evaluate(() => window.editor.setReadOnly(true));
  expect(await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(event);
    return { html: window.editor.getHTML(), prevented: event.defaultPrevented, changes: window.changes.length, undo: window.editor.canUndo() };
  })).toEqual({ html: original, prevented: true, changes: 0, undo: false });
});
