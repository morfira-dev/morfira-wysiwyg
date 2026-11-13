import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const fixture = '<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td><td><p>D</p></td></tr></tbody></table><p><br></p>';
const initialize = async (page: Page, html = fixture): Promise<void> => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => window.editor.setHTML(value), html);
};
const clipboard = async (page: Page, type: 'paste' | 'copy' | 'cut', input: { html?: string; text?: string } = {}, failWrite = false) => page.evaluate(({ type, input, failWrite }) => {
  const data = new DataTransfer();
  if (input.html !== undefined) data.setData('text/html', input.html);
  if (input.text !== undefined) data.setData('text/plain', input.text);
  if (failWrite) Object.defineProperty(data, 'setData', { value: () => { throw new Error('Clipboard write unavailable'); } });
  const event = new ClipboardEvent(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return { handled: event.defaultPrevented, html: data.getData('text/html'), text: data.getData('text/plain') };
}, { type, input, failWrite });

test('TSV paste grows the destination, preserves outside cells and is one undoable edit', async ({ page }) => {
  await initialize(page); await page.locator('.mw-content td').last().click();
  const before = await page.evaluate(() => { window.changes = []; return window.editor.getHTML(); });
  expect((await clipboard(page, 'paste', { text: '1\t2\r\n3\t4\r\n' })).handled).toBe(true);
  await expect(page.locator('.mw-content tr')).toHaveCount(3); await expect(page.locator('.mw-content td')).toHaveCount(9);
  await expect(page.locator('.mw-content td').first()).toHaveText('A');
  await expect(page.locator('.mw-content tr').nth(1).locator('td').nth(1)).toHaveText('1');
  await expect(page.locator('.mw-content td').last()).toHaveText('4');
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  const after = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo()); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo()); expect(await page.evaluate(() => window.editor.getHTML())).toBe(after);
});

test('TSV quoting preserves tabs, multiline values, escaped quotes and empty fields', async ({ page }) => {
  await initialize(page); await page.locator('.mw-content td').first().click();
  await clipboard(page, 'paste', { text: '"A\tB"\t"line1\r\nline2"\t"a""b"\r\n\tC\t\r\n' });
  const cells = page.locator('.mw-content td'); await expect(cells).toHaveCount(6);
  expect(await cells.nth(0).textContent()).toBe('A\tB'); await expect(cells.nth(1).locator('br')).toHaveCount(1);
  await expect(cells.nth(2)).toHaveText('a"b'); await expect(cells.nth(3)).toHaveText(''); await expect(cells.nth(4)).toHaveText('C'); await expect(cells.nth(5)).toHaveText('');
});

test('table HTML takes precedence, preserves spans and supported styles and removes executable content', async ({ page }) => {
  await initialize(page); await page.locator('.mw-content td').first().click();
  await clipboard(page, 'paste', { html: '<table><tr><td rowspan="2" style="background-color:red" onclick="alert(1)"><p><strong>Safe</strong><script>alert(1)</script><img src="javascript:alert(1)"></p></td><td><p>X</p></td></tr><tr><td><p>Y</p></td></tr></table>', text: 'wrong\twrong' });
  await expect(page.locator('.mw-content table')).toHaveCount(1); await expect(page.locator('.mw-content td')).toHaveCount(3);
  await expect(page.locator('.mw-content td[rowspan="2"] strong')).toHaveText('Safe');
  expect(await page.evaluate(() => window.editor.getHTML())).not.toMatch(/onclick|script|javascript|wrong/);
  await expect(page.locator('.mw-content td[rowspan="2"]')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
});

test('copy exports a merged rectangle as semantic HTML and quoted TSV, then round-trips through paste', async ({ page }) => {
  await initialize(page, '<table><tr><td rowspan="2"><p>Main</p></td><td><p>A<br>B</p></td></tr><tr><td><p>Tail</p></td></tr></table><p><br></p>');
  await page.locator('.mw-content td').first().click();
  await page.evaluate(() => window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 1, column: 1 }));
  const before = await page.evaluate(() => window.editor.getHTML()); const data = await clipboard(page, 'copy');
  expect(data.handled).toBe(true); expect(data.text).toBe('Main\t"A\nB"\r\n\tTail'); expect(data.html).toContain('rowspan="2"'); expect(data.html).not.toContain('data-mw');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate((html) => window.editor.setHTML(html), fixture); await page.locator('.mw-content td').first().click();
  await clipboard(page, 'paste', data); await expect(page.locator('.mw-content td')).toHaveCount(3); await expect(page.locator('.mw-content td[rowspan="2"]')).toHaveText('Main');
});

test('cut clears only selected contents, preserves structure and can be undone', async ({ page }) => {
  await initialize(page); await page.locator('.mw-content td').first().click();
  await page.evaluate(() => window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 0, column: 1 }));
  const before = await page.evaluate(() => window.editor.getHTML()); const data = await clipboard(page, 'cut');
  expect(data.text).toBe('A\tB'); await expect(page.locator('.mw-content td')).toHaveCount(4); await expect(page.locator('.mw-content td').first()).toHaveText(''); await expect(page.locator('.mw-content td').nth(2)).toHaveText('C');
  await page.evaluate(() => window.editor.undo()); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
});

test('failed clipboard write never cuts content or adds history', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page); await page.locator('.mw-content td').first().click(); await page.evaluate(() => window.tableCommands(window.editor).select({ row: 0, column: 0 }));
  const before = await page.evaluate(() => window.editor.getHTML()); await clipboard(page, 'cut', {}, true);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await expect(page.getByRole('status')).toContainText('Clipboard write unavailable'); expect(errors).toEqual([]);
});

test('partial destination merges reject paste atomically and browser handlers report errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page, '<table><tr><td rowspan="2"><p>Keep</p></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></table><p><br></p>');
  await page.locator('.mw-content td').first().click(); const before = await page.evaluate(() => window.editor.getHTML());
  await clipboard(page, 'paste', { text: 'x\ty' }); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await expect(page.getByRole('status')).toContainText('merged cell'); expect(errors).toEqual([]);
});

test('fully covered destination merges can be replaced by a rectangular source', async ({ page }) => {
  await initialize(page, '<table><tr><td rowspan="2"><p>Replace</p></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></table><p><br></p>');
  await page.locator('.mw-content td').first().click(); await clipboard(page, 'paste', { text: '1\t2\n3\t4' });
  await expect(page.locator('.mw-content td')).toHaveCount(4); await expect(page.locator('.mw-content [rowspan]')).toHaveCount(0); await expect(page.locator('.mw-content td').last()).toHaveText('4');
});

test('scalar rich content fills an explicit rectangle while preserving destination merges and styles', async ({ page }) => {
  await initialize(page, '<table><tr><td rowspan="2" style="background-color:blue"><p>Keep style</p></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></table><p><br></p>');
  await page.locator('.mw-content td').first().click(); await page.evaluate(() => window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 1, column: 1 }));
  await clipboard(page, 'paste', { html: '<p><strong>Fill</strong></p>', text: 'Fill' });
  await expect(page.locator('.mw-content td')).toHaveCount(3); await expect(page.locator('.mw-content strong')).toHaveCount(3); await expect(page.locator('.mw-content td[rowspan="2"]')).toHaveCSS('background-color', 'rgb(0, 0, 255)');
});

test('selection size mismatch and malformed TSV leave data and history unchanged', async ({ page }) => {
  await initialize(page); await page.locator('.mw-content td').first().click(); await page.evaluate(() => window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 1, column: 1 }));
  const before = await page.evaluate(() => window.editor.getHTML());
  await clipboard(page, 'paste', { text: 'x\ty' }); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await clipboard(page, 'paste', { text: '"unclosed\tx' }); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('oversized clipboard dimensions and destination overflow are rejected', async ({ page }) => {
  await initialize(page, '<table><tr>' + Array.from({ length: 100 }, () => '<td><p>Keep</p></td>').join('') + '</tr></table><p><br></p>');
  await page.locator('.mw-content td').last().click(); const before = await page.evaluate(() => window.editor.getHTML());
  await clipboard(page, 'paste', { text: 'x\ty' }); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await clipboard(page, 'paste', { text: Array(101).fill('x').join('\t') }); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('explicit single-column TSV permits 100 rows and sparse source HTML is padded', async ({ page }) => {
  await initialize(page); await page.locator('.mw-content td').first().click();
  await page.evaluate(() => window.tableCommands(window.editor).paste({ text: Array(100).fill('row').join('\n') + '\n' }));
  await expect(page.locator('.mw-content tr')).toHaveCount(100);
  await page.evaluate((html) => window.editor.setHTML(html), fixture); await page.locator('.mw-content td').first().click();
  await clipboard(page, 'paste', { html: '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>' });
  await expect(page.locator('.mw-content td')).toHaveCount(4); await expect(page.locator('.mw-content td').last()).toHaveText('');
});

test('native text copy and ordinary rich paste inside a cell remain available', async ({ page }) => {
  await initialize(page); await page.evaluate(() => window.editor.setSelection(0, 1));
  expect((await clipboard(page, 'copy')).handled).toBe(false);
  await clipboard(page, 'paste', { html: '<strong>Rich</strong>', text: 'Rich' });
  await expect(page.locator('.mw-content table')).toHaveCount(1); await expect(page.locator('.mw-content td').first().locator('strong')).toHaveText('Rich');
});

test('readonly allows copying a range and blocks clipboard mutations', async ({ page }) => {
  await initialize(page); await page.locator('.mw-content td').first().click();
  await page.evaluate(() => { window.editor.setReadOnly(true); window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 1, column: 1 }); });
  const before = await page.evaluate(() => window.editor.getHTML()); const copied = await clipboard(page, 'copy'); expect(copied.text).toBe('A\tB\r\nC\tD');
  await clipboard(page, 'cut'); await clipboard(page, 'paste', { text: 'x\ty' }); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
});
