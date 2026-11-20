import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const initialize = async (page: Page, value: string, schema: SchemaNodeSpec[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ value, schema }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, schema, onChange: (change) => window.changes.push(change) });
    window.editor.focus();
  }, { value, schema });
};

const select = async (page: Page, backward = false) => page.evaluate((backward) => {
  const root = window.editor.surface;
  const start = root.querySelector('strong')!.firstChild!;
  const end = root.querySelector('em')!.firstChild!;
  document.getSelection()!.setBaseAndExtent(backward ? end : start, 2, backward ? start : end, 2);
  for (const element of root.querySelectorAll('p,h2,blockquote')) {
    if (element.textContent?.includes('Keep')) element.setAttribute('data-test-retained', element.textContent);
  }
}, backward);

const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

const insertEvent = (page: Page, inputType = 'insertText', data: string | null = 'X') => page.evaluate(({ inputType, data }) => {
  const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, { inputType, data });

const fixtures = [
  {
    name: 'root into quote',
    source: '<p><strong>abCD</strong></p><blockquote><p>Gone</p><h2><em>efGH</em></h2><p>Keep quote tail</p></blockquote><p>Keep root</p>',
    result: '<p><strong>abX</strong><em>GH</em></p><blockquote><p>Keep quote tail</p></blockquote><p>Keep root</p>',
  },
  {
    name: 'quote into root',
    source: '<blockquote><p>Keep quote prefix</p><p><strong>abCD</strong></p><h2>Gone</h2></blockquote><p>Gone root</p><h2><em>efGH</em></h2><p>Keep root</p>',
    result: '<blockquote><p>Keep quote prefix</p><p><strong>abX</strong><em>GH</em></p></blockquote><p>Keep root</p>',
  },
  {
    name: 'quote into another quote across intermediate roots',
    source: '<blockquote><p>Keep quote prefix</p><h2><strong>abCD</strong></h2><p>Gone</p></blockquote><p>Gone root</p><blockquote><p>Gone quote</p></blockquote><blockquote><p>Gone</p><p><em>efGH</em></p><p>Keep quote tail</p></blockquote><p>Keep root</p>',
    result: '<blockquote><p>Keep quote prefix</p><h2><strong>abX</strong><em>GH</em></h2></blockquote><blockquote><p>Keep quote tail</p></blockquote><p>Keep root</p>',
  },
];

for (const fixture of fixtures) test(`native cross-quote replacement ${fixture.name} preserves branches, range and one undo`, async ({ page }) => {
  await initialize(page, fixture.source);
  await select(page, true);
  const originalRange = await page.evaluate(() => window.editor.getSelection());
  const retained = await page.locator('[data-test-retained]').count();
  await page.keyboard.type('X');
  expect(await html(page)).toBe(fixture.result);
  await expect(page.locator('[data-test-retained]')).toHaveCount(retained);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  expect(await page.evaluate(() => document.getSelection()!.isCollapsed)).toBe(true);
  await page.keyboard.type('Y');
  expect(await html(page)).toBe(fixture.result.replace('abX', 'abXY'));
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(fixture.result);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(fixture.source);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual(originalRange);
  expect(await page.evaluate(() => document.getSelection()!.anchorNode?.parentElement?.localName)).toBe('em');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(fixture.result);
});

for (const key of ['Backspace', 'Delete']) test(`native cross-quote ${key} joins suffix in the starting quote and preserves terminal quote branches`, async ({ page }) => {
  const fixture = fixtures[2];
  await initialize(page, fixture.source);
  await select(page);
  await page.keyboard.press(key);
  expect(await html(page)).toBe(fixture.result.replace('abX', 'ab'));
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(fixture.source);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('native cross-quote replacement removes an emptied quote and inserts payload as literal text', async ({ page }) => {
  const source = '<p><strong>abCD</strong></p><blockquote><h2><em>efGH</em></h2></blockquote><p>Keep</p>';
  await initialize(page, source);
  await select(page);
  expect(await insertEvent(page, 'insertText', '<img src=x onerror=alert(1)>')).toBe(true);
  expect(await html(page)).toBe('<p><strong>ab&lt;img src=x onerror=alert(1)&gt;</strong><em>GH</em></p><p>Keep</p>');
  await expect(page.locator('.mw-content img,.mw-content blockquote')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(source);
});

test('native cross-quote deletion preserves empty inline affinity and an editable placeholder', async ({ page }) => {
  const source = '<blockquote><p><strong><br></strong></p></blockquote><p><em>😀é</em></p><p>Keep</p>';
  await initialize(page, source);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('strong')!, 0, root.querySelector('em')!.firstChild!, 4);
  });
  expect(await insertEvent(page, 'deleteContentForward', null)).toBe(true);
  // The shared cut preserves the empty ending inline wrapper; it is not a
  // second block or a placeholder at the joined insertion context.
  expect(await html(page)).toBe('<blockquote><p><strong><br></strong><em></em></p></blockquote><p>Keep</p>');
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content > blockquote > p > strong')).toHaveText('X');
  await expect(page.locator('.mw-content > blockquote > p')).toHaveText('X');
  await expect(page.locator('.mw-content > p')).toHaveText('Keep');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(source);
});

test('native cross-quote unsupported middle structures retain their previous delegated path without synthetic mutation', async ({ page }) => {
  for (const middle of ['<hr>', '<ul><li>Task</li></ul>', '<blockquote><blockquote><p>Nested</p></blockquote></blockquote>', '<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>', '<p><img src="https://example.com/image.png" alt=""></p>']) {
    await initialize(page, `<p><strong>abCD</strong></p>${middle}<blockquote><p><em>efGH</em></p></blockquote><p>Keep</p>`);
    const original = await html(page);
    await select(page);
    expect(await insertEvent(page)).toBe(false);
    expect(await html(page)).toBe(original);
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
    expect(await page.evaluate(() => window.changes.length)).toBe(0);
  }
});

test('native cross-quote replacement leaves protected descendants and composition untouched and honors read-only', async ({ page }) => {
  await initialize(page, fixtures[0].source);
  await select(page);
  await page.evaluate(() => window.editor.surface.querySelector('em')!.setAttribute('contenteditable', 'false'));
  expect(await insertEvent(page)).toBe(false);
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
  await page.evaluate(() => window.editor.surface.querySelector('em')!.removeAttribute('contenteditable'));
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  expect(await insertEvent(page)).toBe(false);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.evaluate(() => window.editor.setReadOnly(true));
  expect(await insertEvent(page)).toBe(true);
  expect(await html(page)).toBe(fixtures[0].source);
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('native cross-quote replacement does not reinterpret registered semantic quote or leaf roots', async ({ page }) => {
  const schema: SchemaNodeSpec[] = [
    { name: 'test:quote', kind: 'block', tag: 'blockquote', attributes: { 'data-id': { type: 'text', required: true } } },
    { name: 'test:heading', kind: 'block', tag: 'h2', attributes: { 'data-id': { type: 'text', required: true } } },
  ];
  for (const source of [
    '<p><strong>abCD</strong></p><blockquote data-mw-node="test:quote" data-id="q"><p><em>efGH</em></p></blockquote>',
    '<p><strong>abCD</strong></p><blockquote><h2 data-mw-node="test:heading" data-id="h"><em>efGH</em></h2></blockquote>',
  ]) {
    await initialize(page, source, schema);
    const original = await html(page);
    await select(page);
    expect(await insertEvent(page)).toBe(false);
    expect(await html(page)).toBe(original);
    expect(await page.evaluate(() => window.changes.length)).toBe(0);
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  }
});
