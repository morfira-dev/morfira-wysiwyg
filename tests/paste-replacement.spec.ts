import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const original = '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2><p>Keep</p>';
const initialize = async (page: Page, value = original, schema: SchemaNodeSpec[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ value, schema }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, schema, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
    window.editor.focus();
  }, { value, schema });
};
const selectRich = async (page: Page, backward = false, container = '.mw-content') => {
  await page.locator(container).evaluate((root, backward) => {
    const start = root.querySelector('p')!.firstChild!;
    const end = root.querySelector('h2 em')!.firstChild!;
    (root.closest('.mw-content') as HTMLElement).focus();
    document.getSelection()!.setBaseAndExtent(backward ? end : start, backward ? 2 : 6, backward ? start : end, backward ? 6 : 2);
  }, backward);
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const insert = (page: Page, value: string) => page.evaluate((value) => window.editor.insertHTML(value), value);
const paste = (page: Page, input: { html?: string; text?: string }) => page.evaluate((input) => {
  const data = new DataTransfer();
  if (input.html !== undefined) data.setData('text/html', input.html);
  if (input.text !== undefined) data.setData('text/plain', input.text);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, input);

for (const backward of [false, true]) test(`inline rich HTML replaces a ${backward ? 'backward' : 'forward'} sibling range with precise next input and isolated history`, async ({ page }) => {
  await initialize(page);
  await selectRich(page, backward);
  const keep = await page.locator('.mw-content > p').last().elementHandle();
  await insert(page, '<strong>X</strong>Y');
  const replaced = '<p>Alpha <strong>X</strong>Y<em>ta</em> tail</p><p>Keep</p>';
  expect(await html(page)).toBe(replaced);
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ selection: { index: 8, length: 0 }, changes: 1 });
  expect(await keep!.evaluate((element) => element.isConnected && element === window.editor.surface.lastElementChild)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), backward: document.getSelection()!.anchorNode!.parentElement!.closest('h2') !== null, undo: window.editor.canUndo() }))).toEqual({ selection: { index: 6, length: 5 }, backward, undo: false });
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.insertText('Z');
  expect(await html(page)).toBe('<p>Alpha <strong>X</strong>YZ<em>ta</em> tail</p><p>Keep</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(replaced);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
});

test('clipboard plain text remains literal and normalizes CRLF, lone CR and LF to actual br nodes', async ({ page }) => {
  await initialize(page);
  await selectRich(page, true);
  expect(await paste(page, { text: '<b>X</b>&\r\nY\rZ\nEnd' })).toBe(true);
  expect(await html(page)).toBe('<p>Alpha &lt;b&gt;X&lt;/b&gt;&amp;<br>Y<br>Z<br>End<em>ta</em> tail</p><p>Keep</p>');
  await expect(page.locator('.mw-content br')).toHaveCount(3);
  await expect(page.locator('.mw-content b')).toHaveCount(0);
  await page.keyboard.insertText('!');
  expect(await html(page)).toBe('<p>Alpha &lt;b&gt;X&lt;/b&gt;&amp;<br>Y<br>Z<br>End!<em>ta</em> tail</p><p>Keep</p>');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => document.getSelection()!.anchorNode?.textContent)).toBe('Beta');
});

test('single paragraph payload merges into the retained left wrapper and ignores its own block attributes', async ({ page }) => {
  const value = original.replace('<p>', '<p style="text-align: center">');
  await initialize(page, value);
  await selectRich(page);
  await insert(page, '<p style="text-align: right"><u>X</u>Y</p>');
  expect(await html(page)).toBe('<p style="text-align: center">Alpha <u>X</u>Y<em>ta</em> tail</p><p>Keep</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(value);
});

test('multiple leaf blocks merge only edge children and preserve middle and final wrapper attributes', async ({ page }) => {
  const value = original.replace('<p>', '<p style="text-align: center">');
  await initialize(page, value);
  await selectRich(page, true);
  await insert(page, '<h3 style="color: red">A</h3>\n<p><u>Middle</u></p>\n<h4 style="text-align: right">B</h4>');
  const replaced = '<p style="text-align: center">Alpha A</p><p><u>Middle</u></p><h4 style="text-align: right">B<em>ta</em> tail</h4><p>Keep</p>';
  expect(await html(page)).toBe(replaced);
  await page.keyboard.insertText('!');
  expect(await html(page)).toBe(replaced.replace('>B<em>', '>B!<em>'));
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(value);
  expect(await page.evaluate(() => document.getSelection()!.anchorNode?.textContent)).toBe('Beta');
});

for (const [payload, result] of [
  ['<p><br></p><p>Y</p>', '<p>Alpha </p><p>Y<em>ta</em> tail</p><p>Keep</p>'],
  ['<p>X</p><p><br></p>', '<p>Alpha X</p><p><em>ta</em> tail</p><p>Keep</p>'],
  ['<p>A</p><p></p><p>B</p>', '<p>Alpha A</p><p><br></p><p>B<em>ta</em> tail</p><p>Keep</p>'],
] as const) test(`multi-block placeholders stay editable without adding a duplicate break: ${payload}`, async ({ page }) => {
  await initialize(page);
  await selectRich(page);
  await insert(page, payload);
  expect(await html(page)).toBe(result);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
});

test('a br in a single paragraph is an explicit line break rather than a discarded edge placeholder', async ({ page }) => {
  await initialize(page);
  await selectRich(page);
  await insert(page, '<p><br></p>');
  expect(await html(page)).toBe('<p>Alpha <br><em>ta</em> tail</p><p>Keep</p>');
  expect(await page.evaluate(() => {
    const range = document.getSelection()!.getRangeAt(0);
    return range.startContainer.childNodes[range.startOffset - 1]?.nodeName;
  })).toBe('BR');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
});

test('structural list payload is spliced between retained prefix and original right suffix wrapper', async ({ page }) => {
  await initialize(page);
  await selectRich(page);
  await insert(page, '<ul><li><strong>List</strong></li></ul>');
  const replaced = '<p>Alpha </p><ul><li><strong>List</strong></li></ul><h2><em>ta</em> tail</h2><p>Keep</p>';
  expect(await html(page)).toBe(replaced);
  expect(await page.evaluate(() => {
    const range = document.getSelection()!.getRangeAt(0);
    return { inRight: range.startContainer === window.editor.surface.querySelector('h2'), offset: range.startOffset };
  })).toEqual({ inRight: true, offset: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(replaced);
});

test('a single incoming heading retains its own wrapper and structural insertion with no suffix creates a paragraph', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!, 0, root.querySelector('h2')!, 2);
  });
  await insert(page, '<h3 style="text-align: right">Heading</h3>');
  const replaced = '<p><br></p><h3 style="text-align: right">Heading</h3><p><br></p><p>Keep</p>';
  expect(await html(page)).toBe(replaced);
  await page.keyboard.insertText('Body');
  expect(await html(page)).toBe(replaced.replace('<p><br></p><p>Keep', '<p>Body</p><p>Keep'));
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(original);
});

test('mixed inline and structural payloads create sibling paragraphs without invalid nested blocks', async ({ page }) => {
  await initialize(page);
  await selectRich(page);
  await insert(page, 'Lead<strong>!</strong><hr><blockquote><p>Quote</p></blockquote>End');
  expect(await html(page)).toBe('<p>Alpha </p><p>Lead<strong>!</strong></p><hr><blockquote><p>Quote</p></blockquote><p>End</p><h2><em>ta</em> tail</h2><p>Keep</p>');
  await expect(page.locator('.mw-content p p,.mw-content p hr,.mw-content p blockquote')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
});

test('an incoming link is lifted outside the retained starting link while both keep their own metadata', async ({ page }) => {
  const value = '<p><a href="https://example.com/old"><span data-mw-node="test:reference" data-id="old">Alpha one</span></a></p><h2><em>Beta</em> tail</h2><p>Keep</p>';
  const schema: SchemaNodeSpec[] = [{ name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } }];
  await initialize(page, value, schema);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('a span')!.firstChild!, 6, root.querySelector('h2 em')!.firstChild!, 2);
  });
  await insert(page, '<a href="https://example.com/new">New</a>!');
  const replaced = '<p><a href="https://example.com/old"><span data-mw-node="test:reference" data-id="old">Alpha </span></a><a href="https://example.com/new">New</a>!<em>ta</em> tail</p><p>Keep</p>';
  expect(await html(page)).toBe(replaced);
  await expect(page.locator('.mw-content a a')).toHaveCount(0);
  await page.keyboard.insertText('Y');
  expect(await html(page)).toBe(replaced.replace('</a>!<em>', '</a>!Y<em>'));
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(value);
});

test('semantic paragraph payload stays independent and empty semantic right suffix is preserved', async ({ page }) => {
  const schema: SchemaNodeSpec[] = [
    { name: 'test:note', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } },
    { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } },
  ];
  const value = '<p>Alpha one</p><h2>Beta<span data-mw-node="test:reference" data-id="tail"></span></h2><p>Keep</p>';
  await initialize(page, value, schema);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!.firstChild!, 6, root.querySelector('h2')!.firstChild!, 4);
  });
  await insert(page, '<p data-mw-node="test:note" data-id="payload">Note</p>');
  expect(await html(page)).toBe('<p>Alpha </p><p data-mw-node="test:note" data-id="payload">Note</p><h2><br><span data-mw-node="test:reference" data-id="tail"></span></h2><p>Keep</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(value);
});

for (const container of ['blockquote', 'merged-cell'] as const) test(`multi-block replacement preserves its ${container} ancestor and unrelated nodes`, async ({ page }) => {
  const blocks = '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2>';
  const value = container === 'blockquote' ? `<blockquote style="text-align: right">${blocks}</blockquote><p>Keep</p>` : `<table><tbody><tr><td rowspan="2" colspan="2">${blocks}</td><td><p>Keep A</p></td></tr><tr><td><p>Keep B</p></td></tr></tbody></table><p>Keep</p>`;
  await initialize(page, value);
  const selector = container === 'blockquote' ? '.mw-content blockquote' : '.mw-content td[rowspan="2"]';
  await selectRich(page, true, selector);
  const ancestor = await page.locator(selector).elementHandle();
  const keep = await page.locator('.mw-content > p').last().elementHandle();
  await insert(page, '<p>A</p><p>B</p>');
  await expect(page.locator(selector)).toHaveJSProperty('innerHTML', '<p>Alpha A</p><p>B<em>ta</em> tail</p>');
  expect(await ancestor!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await keep!.evaluate((element) => element.isConnected && element === window.editor.surface.lastElementChild)).toBe(true);
  if (container === 'merged-cell') {
    await expect(page.locator(selector)).toHaveAttribute('rowspan', '2');
    await expect(page.locator(selector)).toHaveAttribute('colspan', '2');
    await expect(page.locator('.mw-content td').nth(1)).toHaveText('Keep A');
    await expect(page.locator('.mw-content td').nth(2)).toHaveText('Keep B');
  }
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(value);
});

test('a figure can be inserted inside one merged cell without moving its suffix or changing the grid', async ({ page }) => {
  const value = '<table><tbody><tr><td rowspan="2"><p>Alpha one</p><h2><em>Beta</em> tail</h2></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table><p>Keep</p>';
  await initialize(page, value);
  await selectRich(page, false, '.mw-content td[rowspan="2"]');
  await insert(page, '<figure><img src="https://example.test/a.png" alt="A"><figcaption>Caption</figcaption></figure>');
  await expect(page.locator('.mw-content td[rowspan="2"]')).toHaveJSProperty('innerHTML', '<p>Alpha </p><figure><img src="https://example.test/a.png" alt="A"><figcaption>Caption</figcaption></figure><h2><em>ta</em> tail</h2>');
  await expect(page.locator('.mw-content table')).toHaveCount(1);
  await expect(page.locator('.mw-content td')).toHaveCount(3);
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(value);
});

test('an inline image is content and does not gain a spurious placeholder break', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!, 0, root.querySelector('h2')!, 2);
  });
  await insert(page, '<p><img src="https://example.test/a.png" alt="A"></p>');
  expect(await html(page)).toBe('<p><img src="https://example.test/a.png" alt="A"></p><p>Keep</p>');
  await page.keyboard.insertText('X');
  expect(await html(page)).toBe('<p><img src="https://example.test/a.png" alt="A">X</p><p>Keep</p>');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(original);
});
