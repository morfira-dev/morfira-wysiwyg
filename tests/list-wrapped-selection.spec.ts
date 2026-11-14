import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, value: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  return page.evaluate((value) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    return window.editor.getHTML();
  }, value);
};
const bodyHTML = (tag: string, content: string, title: string) => tag ? `<${tag} title="${title}" style="text-align: center">${content}</${tag}>` : content;
const source = (left: string, right: string) => `<ul title="Parent"><li title="First">${bodyHTML(left, 'Alpha <strong>one</strong>', 'Body')}</li><li>${bodyHTML(right, '<em>Beta</em> tail', 'Removed')}<ol title="Branch"><li><p>Nested</p></li></ol></li><li title="Keep"><p>Keep</p></li></ul>`;
const select = (page: Page, backward: boolean) => page.evaluate((backward) => {
  const root = window.editor.surface;
  const first = root.querySelector('[title="First"]')!;
  const body = first.querySelector(':scope > p,:scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6') ?? first;
  const last = root.querySelector('em')!.firstChild!;
  root.focus();
  document.getSelection()!.setBaseAndExtent(backward ? last : body.firstChild!, backward ? 2 : 6, backward ? body.firstChild! : last, backward ? 6 : 2);
}, backward);
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const input = (page: Page, inputType: string, data: string | null = null) => page.evaluate(({ inputType, data }) => {
  const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, { inputType, data });
const paste = (page: Page, value: string, rich: boolean) => page.evaluate(({ value, rich }) => {
  const data = new DataTransfer();
  data.setData(rich ? 'text/html' : 'text/plain', value);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, { value, rich });

for (const [left, right] of [['p', 'h2'], ['h1', 'p'], ['h2', 'h6'], ['h5', 'h4'], ['', 'p'], ['h3', '']]) {
  for (const backward of [false, true]) test(`${left || 'inline'} to ${right || 'inline'} list replacement preserves the first body and ${backward ? 'backward' : 'forward'} history`, async ({ page }) => {
    const before = await initialize(page, source(left, right));
    await select(page, backward);
    const first = await page.locator('.mw-content [title="First"]').elementHandle();
    const body = left ? await page.locator('.mw-content [title="Body"]').elementHandle() : first;
    const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
    const keep = await page.locator('.mw-content [title="Keep"]').elementHandle();
    await page.keyboard.type('X');
    const result = `<ul title="Parent"><li title="First">${bodyHTML(left, 'Alpha X<em>ta</em> tail', 'Body')}<ol title="Branch"><li><p>Nested</p></li></ol></li><li title="Keep"><p>Keep</p></li></ul>`;
    expect(await html(page)).toBe(result);
    expect(await first!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector('[title="First"]'))).toBe(true);
    expect(await body!.evaluate((element) => element.isConnected && element === (window.editor.surface.querySelector('[title="Body"]') ?? window.editor.surface.querySelector('[title="First"]')))).toBe(true);
    expect(await branch!.evaluate((element) => element.isConnected && element.parentElement === window.editor.surface.querySelector('[title="First"]'))).toBe(true);
    expect(await keep!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await page.evaluate(() => ({ caret: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ caret: { index: 7, length: 0 }, changes: 1 });
    await page.evaluate(() => window.editor.undo());
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => document.getSelection()!.anchorNode === window.editor.surface.querySelector('em')!.firstChild)).toBe(backward);
    await page.evaluate(() => window.editor.redo());
    expect(await html(page)).toBe(result);
    await page.keyboard.type('!');
    await expect(page.locator('.mw-content [title="First"]')).toHaveText('Alpha X!ta tailNested');
    await page.evaluate(() => window.editor.undo());
    expect(await html(page)).toBe(result);
  });
}

for (const [payload, rich, expected] of [['X\r\nY', false, 'X<br>Y'], ['<u>X</u>', true, '<u>X</u>'], ['<p title="Incoming"><u>X</u></p>', true, '<u>X</u>']] as const) test(`clipboard ${rich ? 'HTML' : 'plain'} ${payload} inserts inside the retained heading`, async ({ page }) => {
  const before = await initialize(page, source('h2', 'p'));
  await select(page, true);
  expect(await paste(page, payload, rich)).toBe(true);
  expect(await html(page)).toBe(`<ul title="Parent"><li title="First">${bodyHTML('h2', `Alpha ${expected}<em>ta</em> tail`, 'Body')}<ol title="Branch"><li><p>Nested</p></li></ol></li><li title="Keep"><p>Keep</p></li></ul>`);
  await expect(page.locator('.mw-content h2 p,.mw-content h2 h2')).toHaveCount(0);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('item-level wrapper edges normalize only for editing and undo restores the original backward item boundaries', async ({ page }) => {
  const before = await initialize(page, '<ol><li title="First"><h3 title="Body">Alpha</h3></li><li><p>Beta</p><ul title="Branch"><li>Nested</li></ul></li><li>Keep</li></ol>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    const items = root.querySelector('ol')!.children;
    root.focus();
    document.getSelection()!.setBaseAndExtent(items[1], 1, items[0], 0);
  });
  expect(await input(page, 'insertText', 'X')).toBe(true);
  expect(await html(page)).toBe('<ol><li title="First"><h3 title="Body">X</h3><ul title="Branch"><li>Nested</li></ul></li><li>Keep</li></ol>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const items = window.editor.surface.querySelector('ol')!.children;
    return { anchor: selection.anchorNode === items[1], anchorOffset: selection.anchorOffset, focus: selection.focusNode === items[0], focusOffset: selection.focusOffset };
  })).toEqual({ anchor: true, anchorOffset: 1, focus: true, focusOffset: 0 });
});

for (const empty of ['', '<br>', '<strong><br></strong>']) test(`empty wrapped bodies (${empty || 'no children'}) retain their wrapper and one placeholder outside nested branches`, async ({ page }) => {
  const before = await initialize(page, `<ul><li title="First"><h2 title="Body">${empty}</h2></li><li><p><br></p><ol title="Branch"><li>Nested</li></ol></li></ul>`);
  await page.evaluate(() => {
    const root = window.editor.surface;
    const items = root.querySelector('ul')!.children;
    const start = items[0].querySelector('strong') ?? items[0].firstElementChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(items[1], 0, start, 0);
  });
  expect(await input(page, 'deleteContentBackward')).toBe(true);
  expect(await html(page)).toBe(`<ul><li title="First"><h2 title="Body">${empty.startsWith('<strong>') ? '<strong><br></strong>' : '<br>'}</h2><ol title="Branch"><li>Nested</li></ol></li></ul>`);
  await expect(page.locator('.mw-content h2 br')).toHaveCount(1);
  await expect(page.locator('.mw-content h2 ol')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('wrapped multiline suffix preserves actual br and rich inline boundaries', async ({ page }) => {
  const before = await initialize(page, '<ul><li><p>Al<br><strong>pha</strong></p></li><li><h4><em>Be</em><br>ta</h4></li></ul>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('h4')!, 1, root.querySelector('p')!.firstChild!, 2);
  });
  expect(await input(page, 'deleteContentForward')).toBe(true);
  expect(await html(page)).toBe('<ul><li><p>Al<br>ta</p></li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('mixed wrapped/direct replacement preserves the empty nested branch placeholder and its actual nodes', async ({ page }) => {
  const before = await initialize(page, '<ul><li title="First"><h2 title="Body">Alpha</h2></li><li><ul title="Branch"><li><p><br></p></li></ul></li><li>Keep</li></ul>');
  const branch = await page.locator('.mw-content [title="Branch"]').elementHandle();
  const placeholder = await page.locator('.mw-content [title="Branch"] br').elementHandle();
  await page.evaluate(() => {
    const root = window.editor.surface;
    const items = root.querySelector(':scope > ul')!.children;
    root.focus();
    document.getSelection()!.setBaseAndExtent(items[1], 0, items[0].querySelector('h2')!.firstChild!, 2);
  });
  expect(await input(page, 'deleteContentForward')).toBe(true);
  expect(await html(page)).toBe('<ul><li title="First"><h2 title="Body">Al</h2><ul title="Branch"><li><p><br></p></li></ul></li><li>Keep</li></ul>');
  expect(await branch!.evaluate((element) => element.isConnected && element.parentElement === window.editor.surface.querySelector('[title="First"]'))).toBe(true);
  expect(await placeholder!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector('[title="Branch"] br'))).toBe(true);
  expect(await page.evaluate(() => ({ caret: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ caret: { index: 2, length: 0 }, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  await page.evaluate(() => window.editor.redo());
  await expect(page.locator('.mw-content [title="Branch"] p > br')).toHaveCount(1);
});

test('wrapped replacement in a nested list within a merged cell preserves ancestors and cell geometry', async ({ page }) => {
  const value = `<table><tbody><tr><td rowspan="2" colspan="2"><ul><li title="Owner">Owner${source('p', 'h2')}</li></ul></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table>`;
  const before = await initialize(page, value);
  const cell = await page.locator('.mw-content td').first().elementHandle();
  const owner = await page.locator('.mw-content [title="Owner"]').elementHandle();
  await select(page, false);
  await page.evaluate(() => window.editor.insertHTML('<p><u>X</u></p>'));
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td')).toHaveText(['OwnerAlpha Xta tailNestedKeep', 'A', 'B']);
  expect(await cell!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await owner!.evaluate((element) => element.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});
