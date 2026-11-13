import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
});

test('edits text, formats a selection and supports undo / redo', async ({ page }) => {
  await page.evaluate(() => { window.editor.setHTML('<p>Hello world</p>'); window.editor.setSelection(0, 5); });
  await page.getByRole('button', { name: 'Полужирный' }).click();
  await expect(page.locator('.mw-content strong')).toHaveText('Hello');
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(page.locator('.mw-content strong')).toHaveCount(0);
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.locator('.mw-content strong')).toHaveText('Hello');
});

test('sanitizes HTML on input, clipboard and output', async ({ page }) => {
  await page.evaluate(() => window.editor.setHTML('<p>Hello<img src="x" onerror="window.pwned=true"></p><script>window.pwned=true</script><a href="javascript:alert(1)">link</a>'));
  const html = await page.evaluate(() => window.editor.getHTML());
  expect(html).not.toMatch(/onerror|<script|javascript:/i);
  await page.getByRole('textbox').click();
  await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<p>Pasted <strong>safe</strong><img src="x" onerror="alert(1)"></p>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    // Firefox ignores ClipboardEventInit.clipboardData for synthetic events.
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    window.editor.surface.dispatchEvent(event);
  });
  await expect(page.locator('.mw-content')).toContainText('Pasted safe');
  expect(await page.evaluate(() => window.editor.getHTML())).not.toMatch(/onerror/i);
});

test('replaces an existing selection when pasting HTML', async ({ page }) => {
  await page.evaluate(() => {
    window.editor.setHTML('<p>Hello world</p>'); window.editor.setSelection(6, 5);
    const clipboardData = new DataTransfer(); clipboardData.setData('text/html', '<strong>Morfira</strong>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    window.editor.surface.dispatchEvent(event);
  });
  await expect(page.locator('.mw-content')).toHaveText('Hello Morfira');
});

test('inserts, expands, merges and splits a table, preserving JSON and HTML', async ({ page }) => {
  await page.evaluate(() => { window.editor.setHTML('<p><br></p>'); window.tableCommands(window.editor).insert(2, 2); });
  await expect(page.locator('.mw-content td')).toHaveCount(4);
  await page.locator('.mw-content td').first().click();
  await page.keyboard.type('First cell');
  await page.evaluate(() => window.tableCommands(window.editor).rowBelow());
  await expect(page.locator('.mw-content td')).toHaveCount(6);
  await page.locator('.mw-content td').first().click();
  await page.evaluate(() => window.tableCommands(window.editor).columnRight());
  await expect(page.locator('.mw-content td')).toHaveCount(9);
  await page.evaluate(() => { window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 0, column: 1 }); window.tableCommands(window.editor).merge(); });
  await expect(page.locator('.mw-content td[colspan="2"]')).toHaveCount(1);
  await page.locator('.mw-content td[colspan="2"]').click();
  await page.evaluate(() => window.tableCommands(window.editor).split());
  await expect(page.locator('.mw-content td')).toHaveCount(9);
  const exported = await page.evaluate(() => {
    const json = window.editor.getJSON(); window.editor.setJSON(json);
    const html = window.editor.getHTML(); window.editor.setHTML(html); return html;
  });
  expect(exported).toContain('<table');
  await expect(page.locator('.mw-content td')).toHaveCount(9);
  await expect(page.locator('.mw-content')).toContainText('First cell');
});

test('table creation participates in undo and rejects invalid dimensions', async ({ page }) => {
  await page.evaluate(() => { window.editor.setHTML('<p>Before</p>'); window.tableCommands(window.editor).insert(2, 3); });
  await expect(page.locator('.mw-content td')).toHaveCount(6);
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.mw-content table')).toHaveCount(0);
  await page.evaluate(() => window.editor.redo());
  await expect(page.locator('.mw-content td')).toHaveCount(6);
  expect(await page.evaluate(() => { try { window.tableCommands(window.editor).insert(0, 3); return false; } catch { return true; } })).toBe(true);
});

test('deletes rows, columns and the whole table', async ({ page }) => {
  await page.evaluate(() => { window.editor.setHTML('<p><br></p>'); window.tableCommands(window.editor).insert(3, 3); });
  await page.locator('.mw-content td').first().click();
  await page.evaluate(() => window.tableCommands(window.editor).deleteRow());
  await expect(page.locator('.mw-content td')).toHaveCount(6);
  await page.locator('.mw-content td').first().click();
  await page.evaluate(() => window.tableCommands(window.editor).deleteColumn());
  await expect(page.locator('.mw-content td')).toHaveCount(4);
  await page.locator('.mw-content td').first().click();
  await page.evaluate(() => window.tableCommands(window.editor).remove());
  await expect(page.locator('.mw-content table')).toHaveCount(0);
});

test('subscriptions stop delivering after unsubscribe and document replacement resets history', async ({ page }) => {
  const count = await page.evaluate(() => {
    let changes = 0;
    const unsubscribe = window.editor.subscribe(() => { changes += 1; });
    window.editor.setHTML('<p>First</p>');
    unsubscribe();
    window.editor.setHTML('<p>Second</p>');
    window.editor.setSelection(0, 6); window.editor.format('bold', true);
    window.editor.setHTML('<p>External document</p>'); window.editor.undo();
    return changes;
  });
  expect(count).toBe(1);
  await expect(page.getByRole('textbox')).toHaveText('External document');
});

test('theme variables can be scoped to the host', async ({ page }) => {
  await page.evaluate(() => window.editor.element.parentElement!.style.setProperty('--mw-surface', 'rgb(10, 20, 30)'));
  await expect(page.locator('.mw-editor')).toHaveCSS('background-color', 'rgb(10, 20, 30)');
});

test('readonly prevents toolbar and table mutations', async ({ page }) => {
  const before = await page.evaluate(() => { window.editor.setReadOnly(true); return window.editor.getHTML(); });
  await expect(page.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Полужирный' })).toBeDisabled();
  await page.evaluate(() => { window.tableCommands(window.editor).insert(2, 2); window.editor.undo(); });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
});

test('repeated readonly updates keep one table UI per instance', async ({ page }) => {
  await expect(page.locator('.mw-table-resize')).toHaveCount(1);
  await page.evaluate(() => {
    window.editor.setReadOnly(false); window.editor.setReadOnly(false);
    window.editor.setReadOnly(true); window.editor.setReadOnly(false);
  });
  await expect(page.locator('.mw-table-resize')).toHaveCount(1);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(page.locator('.mw-table-menu')).toBeHidden();
  await page.evaluate(() => window.editor.setReadOnly(false));
  await expect(page.locator('.mw-table-resize')).toHaveCount(1);
});

test('destroy is idempotent and detaches the instance', async ({ page }) => {
  await page.evaluate(() => { window.dispose(); window.editor.destroy(); });
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(await page.evaluate(() => { try { window.editor.getHTML(); return false; } catch { return true; } })).toBe(true);
});

for (const adapter of ['vue', 'react', 'svelte']) {
  test(`${adapter}: mount, controlled value, user change, readonly, unmount`, async ({ page }) => {
    await page.goto(`/?adapter=${adapter}`);
    await expect(page.getByRole('textbox')).toHaveText('Initial content');
    await page.getByRole('button', { name: 'Update value' }).click();
    await expect(page.getByRole('textbox')).toHaveText('External update');
    expect(await page.evaluate(() => window.changes.length)).toBe(0);
    await page.getByRole('textbox').click();
    await page.keyboard.press('End'); await page.keyboard.type('!');
    await expect(page.getByRole('textbox')).toContainText('!');
    expect(await page.evaluate(() => window.changes.some((change) => change.source === 'user'))).toBe(true);
    await page.getByRole('button', { name: 'Toggle readonly' }).click();
    await expect(page.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
    await page.evaluate(() => window.dispose());
    await expect(page.getByRole('textbox')).toHaveCount(0);
  });
}
