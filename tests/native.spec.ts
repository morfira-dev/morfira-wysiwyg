import { expect, test } from '@playwright/test';
import type { EditorDocument } from '@morfira-dev/wysiwyg';

const initialize = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
};

test('core import works without a browser document', async () => {
  const core = await import('@morfira-dev/wysiwyg');
  expect(typeof core.createEditor).toBe('function');
  expect(typeof core.sanitizeHTML).toBe('function');
});

test('partial removal of bold preserves neighboring text and nested marks', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    window.editor.setHTML('<p><strong><em>Hello world</em></strong></p>');
    window.editor.setSelection(2, 3); window.editor.format('bold', false);
  });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p><strong><em>He</em></strong><em>llo</em><strong><em> world</em></strong></p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 3 });
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.mw-content strong')).toHaveText('Hello world');
});

test('cross-paragraph formatting keeps paragraph boundaries', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => { window.editor.setHTML('<p>First</p><p>Second</p>'); window.editor.setSelection(3, 5); window.editor.format('italic', true); });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Fir<em>st</em></p><p><em>Sec</em>ond</p>');
  await expect(page.locator('.mw-content p')).toHaveCount(2);
});

test('typing history restores caret and a new edit clears redo', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => { window.editor.setHTML('<p>Hello</p>'); window.editor.setSelection(5); });
  await page.keyboard.type(' world');
  await page.evaluate(() => window.editor.undo());
  await expect(page.getByRole('textbox')).toHaveText('Hello');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 5, length: 0 });
  await page.evaluate(() => window.editor.redo());
  await expect(page.getByRole('textbox')).toHaveText('Hello world');
  await page.evaluate(() => window.editor.undo());
  await page.keyboard.type('!');
  expect(await page.evaluate(() => window.editor.canRedo())).toBe(false);
});

test('versioned JSON is validated before mutation and unsafe attributes are omitted', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.editor.setHTML('<p>Original</p>');
    const before = window.editor.getHTML(); let rejected = false;
    try { window.editor.setJSON({ version: 99, children: [] } as unknown as EditorDocument); } catch { rejected = true; }
    const unchanged = window.editor.getHTML() === before;
    window.editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'a', attributes: { href: 'javascript:alert(1)', onclick: 'alert(1)', style: 'color: red; background-image: url(https://example.test/x)' }, children: [{ type: 'text', text: 'safe' }] }] });
    return { rejected, unchanged, html: window.editor.getHTML(), document: window.editor.getJSON() };
  });
  expect(result.rejected && result.unchanged).toBe(true);
  expect(result.document.version).toBe(1);
  expect(result.html).not.toMatch(/javascript:|onclick|background-image|example.test/);
  expect(result.html).toContain('color: red');
});

test('HTML import drops executable content, foreign namespaces and encoded unsafe URLs', async ({ page }) => {
  await initialize(page);
  const html = await page.evaluate(() => {
    window.editor.setHTML('<p>Safe</p><svg><a href="javascript:alert(1)">svg</a></svg><math><mtext>math</mtext></math><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe><a href="java&#x0a;script:alert(1)" onclick="alert(1)">link</a><img src="data:image/svg+xml,x" onerror="alert(1)"><p style="position:fixed; color:blue; background-image:url(x)">Text</p>');
    return window.editor.getHTML();
  });
  expect(html).not.toMatch(/svg|math|iframe|script:|onclick|onerror|data:|position|background-image/i);
  expect(html).toContain('Safe'); expect(html).toContain('color: blue');
});

test('failed transaction restores content, selection and history', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.editor.setHTML('<p>Stable</p>'); window.editor.setSelection(1, 2);
    const before = window.editor.getHTML(); let failed = false;
    try { window.editor.transact((surface) => { surface.textContent = 'broken'; throw new Error('rollback'); }); } catch { failed = true; }
    return { failed, unchanged: before === window.editor.getHTML(), undo: window.editor.canUndo(), selection: window.editor.getSelection() };
  });
  expect(result).toEqual({ failed: true, unchanged: true, undo: false, selection: { index: 1, length: 2 } });
});

test('IME composition commits one history revision', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    const editor = window.editor; editor.setHTML('<p>Start</p>'); editor.setSelection(5);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.surface.querySelector('p')!.textContent = 'Startあ';
    editor.surface.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'あ', isComposing: true, bubbles: true }));
    editor.surface.querySelector('p')!.textContent = 'Startあい';
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { data: 'あい', bubbles: true }));
  });
  await expect(page.getByRole('textbox')).toHaveText('Startあい');
  await page.evaluate(() => window.editor.undo());
  await expect(page.getByRole('textbox')).toHaveText('Start');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('row insertion and origin deletion preserve a vertically merged cell', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.editor.setHTML('<table><tbody><tr><td rowspan="2"><p>Spanning</p></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table><p><br></p>'));
  await page.locator('.mw-content td').nth(1).click();
  await page.evaluate(() => window.tableCommands(window.editor).rowBelow());
  await expect(page.locator('.mw-content td[rowspan="3"]')).toContainText('Spanning');
  await page.locator('.mw-content td').nth(1).click();
  await page.evaluate(() => window.tableCommands(window.editor).deleteRow());
  await expect(page.locator('.mw-content td[rowspan="2"]')).toContainText('Spanning');
  await expect(page.locator('.mw-content tr')).toHaveCount(2);
});

test('column insertion and origin deletion preserve a horizontally merged cell', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.editor.setHTML('<table><tbody><tr><td colspan="2"><p>Spanning</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table><p><br></p>'));
  await page.locator('.mw-content td').nth(1).click();
  await page.evaluate(() => window.tableCommands(window.editor).columnRight());
  await expect(page.locator('.mw-content td[colspan="3"]')).toContainText('Spanning');
  await page.locator('.mw-content td').nth(1).click();
  await page.evaluate(() => window.tableCommands(window.editor).deleteColumn());
  await expect(page.locator('.mw-content td[colspan="2"]')).toContainText('Spanning');
});

test('table keyboard navigation, colors and column width use the document history', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => { window.editor.setHTML('<p><br></p>'); window.tableCommands(window.editor).insert(1, 2); });
  await page.locator('.mw-content td').last().click();
  await page.keyboard.press('Tab');
  await expect(page.locator('.mw-content tr')).toHaveCount(2);
  await page.evaluate(() => { const commands = window.tableCommands(window.editor); commands.background('#ff0000'); commands.columnWidth(0, 180); });
  expect(await page.evaluate(() => window.editor.getHTML())).toContain('rgb(255, 0, 0)');
  await expect(page.locator('.mw-content col').first()).toHaveAttribute('style', /180px/);
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.mw-content col').first()).not.toHaveAttribute('style', /180px/);
});

test('invalid table selection and nested insertion leave the document unchanged', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const commands = window.tableCommands(window.editor); commands.insert(2, 2);
    const before = window.editor.getHTML(); let invalid = false; let nested = false;
    try { commands.select({ row: 500, column: 0 }); } catch { invalid = true; }
    try { commands.insert(1, 1); } catch { nested = true; }
    return { invalid, nested, unchanged: before === window.editor.getHTML() };
  });
  expect(result).toEqual({ invalid: true, nested: true, unchanged: true });
});

test('instances own table APIs and disposing one leaves the other editable', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const host = document.createElement('div'); document.body.append(host);
    const second = window.createEditor(host, { value: '<p>Second</p>', plugins: [window.createTables()] });
    const primary = window.editor;
    window.tableCommands(second).insert(1, 2);
    primary.destroy();
    const intact = second.surface.querySelectorAll('td').length === 2;
    second.setHTML('<p>Still alive</p>'); const html = second.getHTML(); second.destroy(); host.remove();
    return { intact, html };
  });
  expect(result).toEqual({ intact: true, html: '<p>Still alive</p>' });
});

test('failed plugin setup and invalid initial content do not leave a mounted view', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const host = document.createElement('div'); document.body.append(host); let cleaned = false; let failed = false;
    try {
      window.createEditor(host, { plugins: [{ name: 'first', setup: () => () => { cleaned = true; } }, { name: 'broken', setup: () => { throw new Error('setup'); } }] });
    } catch { failed = true; }
    const empty = host.childNodes.length === 0;
    let invalid = false;
    try { window.createEditor(host, { value: 'x'.repeat(5_000_001) }); } catch { invalid = true; }
    const noView = host.childNodes.length === 0; host.remove(); return { cleaned, failed, empty, invalid, noView };
  });
  expect(result).toEqual({ cleaned: true, failed: true, empty: true, invalid: true, noView: true });
});

test('cleanup continues after a throwing disposer', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const host = document.createElement('div'); document.body.append(host); let cleaned = false;
    const instance = window.createEditor(host, { plugins: [{ name: 'first', setup: () => () => { cleaned = true; } }, { name: 'throwing', setup: () => () => { throw new Error('cleanup'); } }] });
    let failed = false; try { instance.destroy(); } catch { failed = true; }
    instance.destroy(); const noView = host.childNodes.length === 0; host.remove(); return { cleaned, failed, noView };
  });
  expect(result).toEqual({ cleaned: true, failed: true, noView: true });
});

test('resizing a second table leaves the focused first table unchanged and is one undo step', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.editor.setHTML('<table><tbody><tr><td><p>First A</p></td><td><p>First B</p></td></tr></tbody></table><p>Between</p><table><tbody><tr><td><p>Second A</p></td><td><p>Second B</p></td></tr></tbody></table><p><br></p>'));
  const first = page.locator('.mw-content table').first();
  const second = page.locator('.mw-content table').nth(1);
  await first.locator('td').first().click();
  const before = await page.evaluate(() => window.editor.getHTML());
  await second.locator('td').first().hover();
  const handle = page.getByRole('button', { name: 'Изменить ширину столбца' });
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Expected a visible resize handle.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + 50, box.y + box.height / 2, { steps: 4 }); await page.mouse.up();
  await expect(first.locator('col')).toHaveCount(0);
  await expect(second.locator('col')).toHaveCount(2);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('disabling bold at an interior caret preserves position and surrounding italic', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => { window.editor.setHTML('<p><strong><em>Hello</em></strong></p>'); window.editor.setSelection(2); window.editor.format('bold', false); });
  await page.keyboard.type('x');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p><strong><em>He</em></strong><em>x</em><strong><em>llo</em></strong></p>');
});

test('enabling bold at a caret applies it to the following text', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => { window.editor.setHTML('<p>Hello</p>'); window.editor.setSelection(5); window.editor.format('bold', true); });
  await page.keyboard.type('!');
  await expect(page.locator('.mw-content strong')).toHaveText('!');
  await expect(page.getByRole('textbox')).toHaveText('Hello!');
});

test('pending inline formats do not mutate an empty document and typing replaces its placeholder', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => {
    window.editor.setHTML('<p><br></p>'); window.editor.setSelection(0);
    const html = window.editor.getHTML(); window.editor.format('bold', true);
    return { html, pending: window.editor.getHTML(), bold: window.editor.getFormats().bold };
  });
  expect(before.pending).toBe(before.html); expect(before.bold).toBe(true);
  await page.keyboard.type('Ab');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p><strong>Ab</strong></p>');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before.html);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});
