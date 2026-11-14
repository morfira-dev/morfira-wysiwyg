import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const initialize = async (page: Page, value: string, schema: SchemaNodeSpec[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  return page.evaluate(({ value, schema }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, schema, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    return window.editor.getHTML();
  }, { value, schema });
};
const select = (page: Page, backward = false) => page.evaluate((backward) => {
  const root = window.editor.surface;
  const start = root.querySelector('[title="Start"]')!.firstChild!;
  const end = root.querySelector('[title="End"] em')!.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(backward ? end : start, backward ? 2 : 6, backward ? start : end, backward ? 6 : 2);
}, backward);
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const sameItem = '<ul><li title="Owner"><p title="Before">Keep before</p><h2 title="Start">Alpha <strong>one</strong></h2><p>Covered</p><h3 title="End"><em>Beta</em> tail</h3><p title="After">Keep after</p><ol title="Branch"><li><p><br></p></li></ol></li><li>Other</li></ul>';
const sameResult = (payload: string) => `<ul><li title="Owner"><p title="Before">Keep before</p><h2 title="Start">Alpha ${payload}<em>ta</em> tail</h2><p title="After">Keep after</p><ol title="Branch"><li><p><br></p></li></ol></li><li>Other</li></ul>`;

for (const backward of [false, true]) {
  for (const inputType of ['insertText', 'deleteContentBackward', 'deleteContentForward']) test(`${inputType} across bodies within one item preserves untouched blocks and ${backward ? 'backward' : 'forward'} undo boundaries`, async ({ page }) => {
    const before = await initialize(page, sameItem);
    const owner = await page.locator('.mw-content [title="Owner"]').elementHandle();
    const first = await page.locator('.mw-content [title="Before"]').elementHandle();
    const after = await page.locator('.mw-content [title="After"]').elementHandle();
    const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
    await select(page, backward);
    expect(await page.evaluate((inputType) => {
      const event = new InputEvent('beforeinput', { inputType, data: inputType === 'insertText' ? 'X' : null, cancelable: true, bubbles: true });
      window.editor.surface.dispatchEvent(event);
      return event.defaultPrevented;
    }, inputType)).toBe(true);
    expect(await html(page)).toBe(sameResult(inputType === 'insertText' ? 'X' : ''));
    for (const node of [owner, first, after, branch]) expect(await node!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await page.evaluate(() => window.changes.length)).toBe(1);
    await page.evaluate(() => window.editor.undo());
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => {
      const selection = document.getSelection()!;
      return { anchor: selection.anchorNode?.textContent, anchorOffset: selection.anchorOffset, focus: selection.focusNode?.textContent, focusOffset: selection.focusOffset };
    })).toEqual(backward ? { anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6 } : { anchor: 'Alpha ', anchorOffset: 6, focus: 'Beta', focusOffset: 2 });
    await page.evaluate(() => window.editor.redo());
    expect(await html(page)).toBe(sameResult(inputType === 'insertText' ? 'X' : ''));
  });
}

test('replacement across sibling multi-block items joins only endpoint bodies and preserves actual following blocks', async ({ page }) => {
  const before = await initialize(page, '<ol><li title="Owner"><p>Before</p><h2 title="Start">Alpha <strong>one</strong></h2><p>Covered left</p></li><li><p>Covered middle</p><h3>Covered too</h3></li><li><p>Covered right</p><h4 title="End"><em>Beta</em> tail</h4><h5 title="After">After</h5><ul title="Branch"><li>Nested</li></ul></li><li>Other</li></ol>');
  const after = await page.locator('.mw-content [title="After"]').elementHandle();
  await select(page, true);
  await page.evaluate(() => window.editor.insertHTML('<p><u>X</u></p>'));
  expect(await html(page)).toBe('<ol><li title="Owner"><p>Before</p><h2 title="Start">Alpha <u>X</u><em>ta</em> tail</h2><h5 title="After">After</h5><ul title="Branch"><li>Nested</li></ul></li><li>Other</li></ol>');
  expect(await after!.evaluate((node) => node.isConnected && node.parentElement === window.editor.surface.querySelector('[title="Owner"]'))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('direct inline start promotes to a paragraph only when untouched right blocks survive', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Start">Alpha <strong>one</strong></li><li><h2 title="End"><em>Beta</em> tail</h2><p title="After">After</p></li></ul>');
  const after = await page.locator('.mw-content [title="After"]').elementHandle();
  await select(page, true);
  await page.evaluate(() => window.editor.insertHTML('<u>X</u>'));
  expect(await html(page)).toBe('<ul><li title="Start"><p>Alpha <u>X</u><em>ta</em> tail</p><p title="After">After</p></li></ul>');
  expect(await after!.evaluate((node) => node.isConnected)).toBe(true);
  await page.keyboard.insertText('!');
  await expect(page.locator('.mw-content [title="Start"] > p').first()).toHaveText('Alpha X!ta tail');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(before);
});

test('item-level edges across body blocks replace only that body interval and restore original DOM endpoints', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="Owner"><p>Before</p><h2>First</h2><p>Second</p><h3>After</h3></li></ul>');
  await page.evaluate(() => {
    const item = window.editor.surface.querySelector('li')!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(item, 3, item, 1);
    window.editor.insertHTML('X');
  });
  expect(await html(page)).toBe('<ul><li title="Owner"><p>Before</p><h2>X</h2><h3>After</h3></li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const item = window.editor.surface.querySelector('li');
    return { anchor: selection.anchorNode === item, anchorOffset: selection.anchorOffset, focus: selection.focusNode === item, focusOffset: selection.focusOffset };
  })).toEqual({ anchor: true, anchorOffset: 3, focus: true, focusOffset: 1 });
});

test('multiple incoming blocks remain rejected atomically for a multi-block list source', async ({ page }) => {
  const before = await initialize(page, sameItem);
  await select(page, true);
  expect(await page.evaluate(() => {
    try { window.editor.insertHTML('<p>One</p><p>Two</p>'); return false; }
    catch { return true; }
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), anchor: document.getSelection()!.anchorNode?.textContent }))).toEqual({ changes: 0, undo: false, anchor: 'Beta' });
});

test('clipboard rejects multi-block payloads but accepts inline content within one multi-block item', async ({ page }) => {
  const before = await initialize(page, sameItem);
  await select(page, true);
  const paste = (value: string) => page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData('text/html', value);
    data.setData('text/plain', 'Wrong fallback');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  }, value);
  expect(await paste('<p>One</p><p>Two</p>')).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
  expect(await paste('<u>X</u>')).toBe(true);
  expect(await html(page)).toBe(sameResult('<u>X</u>'));
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('a semantic later body blocks replacement even when the selected endpoint bodies are ordinary', async ({ page }) => {
  const schema: SchemaNodeSpec = { name: 'test:body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };
  const before = await initialize(page, sameItem.replace('<p title="After">Keep after</p>', '<p data-mw-node="test:body" data-id="keep">Keep after</p>'), [schema]);
  await select(page, true);
  expect(await page.evaluate(() => {
    const input = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true, bubbles: true });
    window.editor.surface.dispatchEvent(input);
    return input.defaultPrevented;
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo(), anchor: document.getSelection()!.anchorNode?.textContent }))).toEqual({ changes: 0, undo: false, anchor: 'Beta' });
});

test('same-item multi-block replacement inside a merged cell preserves cell and ancestor identity', async ({ page }) => {
  const value = `<table><tbody><tr><td rowspan="2" colspan="2">${sameItem}</td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>`;
  const before = await initialize(page, value);
  const cell = await page.locator('.mw-content td').first().elementHandle();
  await select(page);
  await page.evaluate(() => window.editor.insertHTML('<u>X</u>'));
  await expect(page.locator('.mw-content td').first()).toHaveJSProperty('innerHTML', sameResult('<u>X</u>'));
  expect(await cell!.evaluate((element) => element.isConnected && element.getAttribute('rowspan') === '2' && element.getAttribute('colspan') === '2')).toBe(true);
  await expect(page.locator('.mw-content td')).toHaveCount(3);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});
