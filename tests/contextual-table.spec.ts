import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './contextual-table.types.js';

const merged = '<p>Before</p><table><tbody><tr><td rowspan="2"><p><em>A</em></p></td><td><p><strong>B</strong></p></td><td>C</td></tr><tr><td>D</td><td>E</td></tr><tr><td>F</td><td>G</td><td>H</td></tr></tbody></table><p>After</p>';
const columns = '<p>Before</p><table><tbody><tr><td colspan="2"><p><em>A</em></p></td><td>B</td></tr><tr><td>C</td><td>D</td><td>E</td></tr><tr><td>F</td><td>G</td><td>H</td></tr></tbody></table><p>After</p>';
const panel = (page: Page) => page.locator('.table-context-host .mw-contextual-table');
const action = (page: Page, name: string) => panel(page).locator('[data-mw-table-action="' + name + '"]');
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

const initialize = async (page: Page, value = merged) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    await Promise.all(['core/dist/style.css', 'plugins/dist/tables.css', 'plugins/dist/ui/contextual-table.css'].map((path) => new Promise<void>((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/packages/' + path;
      css.onload = () => resolve();
      css.onerror = () => reject(new Error('Could not load ' + path));
      document.head.append(css);
    })));
    const mount = document.createElement('div');
    mount.className = 'table-context-mount';
    mount.style.cssText = 'margin:160px 16px 20px;max-width:480px';
    const host = document.createElement('div');
    host.className = 'table-context-host';
    const outside = document.createElement('input');
    outside.setAttribute('aria-label', 'Outside table context');
    outside.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2001;width:160px';
    document.body.prepend(mount, host, outside);
    const tablePath = '/packages/plugins/dist/tables.js';
    const { tables, tableCommands } = await import(/* @vite-ignore */ tablePath) as typeof import('@morfira-dev/wysiwyg/plugins/tables');
    const uiPath = '/packages/plugins/dist/ui/contextual-table.js';
    const { createContextualTableUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/contextual-table');
    window.changes = [];
    window.editor = window.createEditor(mount, { value, locale: 'en', plugins: [tables()], onChange: (change) => window.changes.push(change) });
    window.contextualTableAPI = tableCommands(window.editor);
    window.contextualTableUI = createContextualTableUI(host, window.editor);
    window.dispose = () => { window.contextualTableUI.destroy(); window.editor.destroy(); mount.remove(); host.remove(); outside.remove(); };
  }, value);
};
const caret = async (page: Page, selector = 'td', expanded = false) => {
  await page.evaluate(({ selector, expanded }) => {
    const cell = window.editor.surface.querySelector(selector)!;
    window.editor.focus();
    const range = document.createRange();
    range.selectNodeContents(cell.querySelector('p') ?? cell);
    if (!expanded) range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.editor.surface.dispatchEvent(new Event('click', { bubbles: true }));
    window.contextualTableUI.refresh();
  }, { selector, expanded });
};
const region = async (page: Page) => {
  await caret(page);
  await page.evaluate(() => window.contextualTableAPI.select({ row: 0, column: 0 }, { row: 1, column: 1 }));
  await expect(panel(page)).toBeVisible();
};

test('cell preview is focus/history neutral, localizes native controls and reserves links/images/text ranges for their owners', async ({ page }) => {
  await initialize(page, merged.replace('<strong>B</strong>', '<a href="https://example.com">B</a><img src="/table-context.svg" alt="Inline">'));
  const before = await html(page);
  await caret(page);
  await expect(panel(page)).toBeVisible();
  await expect(action(page, 'merge')).toBeDisabled();
  await expect(action(page, 'split')).toBeEnabled();
  expect(await page.evaluate(() => ({ focus: document.activeElement === window.editor.surface, changes: window.changes.length, undo: window.editor.canUndo(), controls: window.contextualTableUI.element.querySelectorAll('button[type="button"]').length }))).toEqual({ focus: true, changes: 0, undo: false, controls: 11 });
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(action(page, 'rowAbove')).toHaveText('Строка выше');
  await expect(action(page, 'selectRow')).toHaveText('Выделить строки');
  await expect(action(page, 'selectColumn')).toHaveText('Выделить столбцы');
  await expect(action(page, 'selectTable')).toHaveText('Выделить таблицу');
  await expect(panel(page)).toHaveAttribute('aria-label', 'Действия с таблицей');
  await caret(page, 'td', true);
  await expect(panel(page)).toBeHidden();
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'rowAbove')).toBeFocused();
  await page.keyboard.press('Escape');
  await caret(page, 'a');
  await expect(panel(page)).toBeHidden();
  await page.evaluate(() => {
    window.editor.focus();
    const range = document.createRange();
    range.selectNode(window.editor.surface.querySelector('img')!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.contextualTableUI.refresh();
  });
  await expect(panel(page)).toBeHidden();
  expect(await html(page)).toBe(before);
});

test('row insertion and deletion through a rowspan preserve actual rich neighbors and each has one Undo', async ({ page }) => {
  await initialize(page);
  const before = await html(page);
  const original = await page.evaluateHandle(() => ({ cell: window.editor.surface.querySelector('td')!, rich: window.editor.surface.querySelector('em')! }));
  await caret(page, 'tr:nth-child(2) td');
  await action(page, 'rowAbove').click();
  await expect(page.locator('.mw-content tr')).toHaveCount(4);
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '3');
  expect(await original.evaluate(({ cell, rich }) => cell.isConnected && rich.isConnected && cell.contains(rich))).toBe(true);
  await expect(panel(page)).toBeHidden();
  await page.evaluate(() => window.contextualTableUI.refresh());
  await expect(panel(page)).toBeHidden();
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await caret(page, 'tr:nth-child(2) td');
  await action(page, 'deleteRow').click();
  await expect(page.locator('.mw-content tr')).toHaveCount(2);
  await expect(page.locator('.mw-content td').first()).not.toHaveAttribute('rowspan');
  await expect(page.locator('.mw-content')).toContainText('A');
  await expect(page.locator('.mw-content')).not.toContainText('D');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('column insertion and deletion through a colspan keep rich content and the logical span with one Undo', async ({ page }) => {
  await initialize(page, columns);
  const before = await html(page);
  const original = await page.evaluateHandle(() => window.editor.surface.querySelector('em')!);
  await caret(page, 'tr:nth-child(2) td:nth-child(2)');
  await action(page, 'columnLeft').click();
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '3');
  await expect(page.locator('.mw-content tr').nth(1).locator('td')).toHaveCount(4);
  expect(await original.evaluate((node) => node.isConnected && node.textContent === 'A')).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await caret(page, 'tr:nth-child(2) td:nth-child(2)');
  await action(page, 'deleteColumn').click();
  await expect(page.locator('.mw-content td').first()).not.toHaveAttribute('colspan');
  await expect(page.locator('.mw-content tr').nth(1).locator('td')).toHaveCount(2);
  await expect(page.locator('.mw-content')).not.toContainText('D');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('explicit merged rectangle survives external toolbar pointers and lost native Selection; merge/split preserve rich nodes and history', async ({ page }) => {
  await initialize(page);
  const before = await html(page);
  await region(page);
  await expect(action(page, 'merge')).toBeEnabled();
  const original = await page.evaluateHandle(() => ({ a: window.editor.surface.querySelector('em')!, b: window.editor.surface.querySelector('strong')! }));
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'rowAbove')).toBeFocused();
  await page.evaluate(() => { document.getSelection()!.removeAllRanges(); window.contextualTableUI.refresh(); });
  await expect(panel(page)).toBeVisible();
  // Real pointer propagation reaches the table plugin; its registered UI host preserves private selection.
  await action(page, 'merge').click();
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  expect(await original.evaluate(({ a, b }) => a.isConnected && b.isConnected && a.closest('td') === b.closest('td'))).toBe(true);
  await expect(page.locator('.mw-content td').first()).toContainText('D');
  const combined = await html(page);
  await caret(page);
  await action(page, 'split').click();
  await expect(page.locator('.mw-content td')).toHaveCount(9);
  await expect(page.locator('.mw-content td').first()).not.toHaveAttribute('rowspan');
  await expect(page.locator('.mw-content td').first()).not.toHaveAttribute('colspan');
  await expect(page.locator('.mw-content td').first()).toContainText('D');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(combined);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('bounded capabilities and unsupported/spoofed table structures never authorize retained controls', async ({ page, browserName }) => {
  const wide = '<table><tbody><tr>' + '<td>x</td>'.repeat(100) + '</tr></tbody></table>';
  await initialize(page, wide);
  await caret(page);
  await expect(panel(page)).toBeVisible();
  await expect(action(page, 'columnLeft')).toBeDisabled();
  await expect(action(page, 'columnRight')).toBeDisabled();
  await expect(action(page, 'merge')).toBeDisabled();
  await expect(action(page, 'split')).toBeDisabled();
  const before = await html(page);
  await action(page, 'columnLeft').evaluate((button) => (button as HTMLButtonElement).click());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  if (browserName === 'firefox') {
    expect(await page.evaluate(() => {
      const selection = document.getSelection()!;
      const second = document.createRange();
      second.selectNodeContents(window.editor.surface.querySelector('td:last-child')!);
      selection.addRange(second);
      window.contextualTableUI.refresh();
      return { ranges: selection.rangeCount, hidden: window.contextualTableUI.element.hidden };
    })).toEqual({ ranges: 2, hidden: true });
    await caret(page);
  }
  expect(await page.evaluate(() => {
    const cell = window.editor.surface.querySelector('td')!;
    const other = cell.nextElementSibling!;
    other.setAttribute('data-mw-selected', 'true');
    window.contextualTableUI.refresh();
    const spoof = window.contextualTableUI.element.querySelector<HTMLButtonElement>('[data-mw-table-action="merge"]')!.disabled;
    other.removeAttribute('data-mw-selected');
    const table = cell.closest('table')!;
    table.setAttribute('data-mw-node', 'app:owned');
    window.contextualTableUI.refresh();
    const semantic = window.contextualTableUI.element.hidden;
    table.removeAttribute('data-mw-node');
    const row = table.insertRow();
    row.insertCell().textContent = 'Ragged';
    window.contextualTableUI.refresh();
    const ragged = window.contextualTableUI.element.hidden;
    row.remove();
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cell.append(foreign);
    window.contextualTableUI.refresh();
    const namespace = window.contextualTableUI.element.hidden;
    return { spoof, semantic, ragged, namespace, undo: window.editor.canUndo() };
  })).toEqual({ spoof: true, semantic: true, ragged: true, namespace: true, undo: false });
  await page.evaluate(() => window.editor.setHTML('<table><tbody>' + '<tr><td>x</td></tr>'.repeat(100) + '</tbody></table>'));
  await caret(page);
  await expect(action(page, 'rowAbove')).toBeDisabled();
  await expect(action(page, 'rowBelow')).toBeDisabled();
});

test('Escape cancels pending focus, same-region select reopens, and read-only/IME/API replacement invalidate retained actions', async ({ page }) => {
  await initialize(page);
  await region(page);
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'rowAbove')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.contextualTableUI.refresh());
  await expect(panel(page)).toBeHidden();
  expect(await page.evaluate(() => document.activeElement === window.editor.surface)).toBe(true);
  await page.evaluate(() => window.contextualTableAPI.select({ row: 0, column: 0 }, { row: 1, column: 1 }));
  await expect(panel(page)).toBeVisible();
  await page.evaluate(async () => {
    const surface = window.editor.surface;
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, cancelable: true }));
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(panel(page)).toBeHidden();
  await caret(page);
  const retained = await action(page, 'deleteRow').elementHandle();
  const before = await html(page);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await retained!.evaluate((button) => (button as HTMLButtonElement).click());
  expect(await html(page)).toBe(before);
  await page.evaluate(async () => {
    window.editor.setReadOnly(false);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(panel(page)).toBeHidden();
  await caret(page);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await expect(panel(page)).toBeHidden();
  await retained!.evaluate((button) => (button as HTMLButtonElement).click());
  expect(await html(page)).toBe(before);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.evaluate(async () => {
    window.editor.setHTML('<p>Replacement</p>');
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(panel(page)).toBeHidden();
  await retained!.evaluate((button) => (button as HTMLButtonElement).click());
  expect(await page.evaluate(() => ({ text: window.editor.getText().trim(), undo: window.editor.canUndo() }))).toEqual({ text: 'Replacement', undo: false });
});

test('focus callbacks cannot retarget a structural action to a replacement document, another region or a destroyed editor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page);
  await region(page);
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'rowAbove')).toBeFocused();
  await page.evaluate((value) => {
    window.editor.surface.addEventListener('focusin', () => window.editor.setHTML(value), { once: true });
    window.contextualTableUI.element.querySelector<HTMLButtonElement>('[data-mw-table-action="deleteRow"]')!.click();
  }, columns);
  expect(await page.evaluate(() => ({ rows: window.editor.surface.querySelectorAll('tr').length, undo: window.editor.canUndo() }))).toEqual({ rows: 3, undo: false });
  await caret(page);
  // Establish the intentional private region before a focus callback changes it.
  await page.evaluate(() => window.contextualTableAPI.select({ row: 0, column: 0 }));
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'rowAbove')).toBeFocused();
  const before = await html(page);
  expect(await page.evaluate(() => {
    let changed = false;
    window.editor.surface.addEventListener('focusin', () => {
      window.contextualTableAPI.select({ row: 2, column: 1 });
      changed = true;
    }, { once: true });
    window.contextualTableUI.element.querySelector<HTMLButtonElement>('[data-mw-table-action="deleteColumn"]')!.click();
    return changed;
  })).toBe(true);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await caret(page);
  // Establish the intentional private region before a focus callback changes it.
  await page.evaluate(() => window.contextualTableAPI.select({ row: 0, column: 0 }));
  await page.keyboard.press('Alt+F10');
  await expect(action(page, 'rowAbove')).toBeFocused();
  await page.evaluate(() => window.editor.surface.addEventListener('focusin', () => window.editor.destroy(), { once: true }));
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.contextualTableUI.element.isConnected)).toBe(false);
  expect(errors).toEqual([]);
});

test('narrow clipping repositions without image clones; outside focus, disposal, invalid setup and SSR preserve ownership', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  let requests = 0;
  await page.route('**/table-context.svg', async (route) => {
    requests++;
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="navy"/></svg>' });
  });
  await initialize(page, merged.replace('<em>A</em>', '<em>A</em><img src="/table-context.svg" alt="Resource">'));
  await page.locator('.table-context-mount').evaluate((mount) => { (mount as HTMLElement).style.cssText = 'margin:120px 8px 20px;width:280px;height:180px;overflow:auto'; });
  await caret(page);
  await expect(panel(page)).toBeVisible();
  const box = await panel(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  await expect.poll(() => requests).toBe(1);
  await page.locator('.table-context-mount').evaluate((mount) => {
    const spacer = document.createElement('div');
    spacer.style.height = '900px';
    mount.append(spacer);
    mount.scrollTop = 800;
    mount.dispatchEvent(new Event('scroll'));
  });
  await expect(panel(page)).toBeHidden();
  await page.locator('.table-context-mount').evaluate((mount) => { mount.scrollTop = 0; mount.dispatchEvent(new Event('scroll')); });
  await expect(panel(page)).toBeVisible();
  await page.getByLabel('Outside table context').click();
  await expect(panel(page)).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Outside table context');
  expect(requests).toBe(1);
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/contextual-table.js';
    const { createContextualTableUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/contextual-table');
    const host = document.querySelector<HTMLElement>('.table-context-host')!;
    const retained = window.contextualTableUI.element.querySelector<HTMLButtonElement>('[data-mw-table-action="deleteRow"]')!;
    const before = window.editor.getHTML();
    window.contextualTableUI.destroy();
    window.contextualTableUI.destroy();
    retained.click();
    let refreshThrows = false;
    try { window.contextualTableUI.refresh(); } catch { refreshThrows = true; }
    let invalid = false;
    try { createContextualTableUI(host, window.editor, { gap: Infinity }); } catch { invalid = true; }
    const mount = document.createElement('div');
    const otherHost = document.createElement('div');
    document.body.append(mount, otherHost);
    const other = window.createEditor(mount, { value: '<p>Other</p>' });
    let missing = false;
    try { createContextualTableUI(otherHost, other); } catch { missing = true; }
    other.destroy();
    mount.remove();
    otherHost.remove();
    return { refreshThrows, invalid, missing, empty: host.childNodes.length === 0, unchanged: window.editor.getHTML() === before };
  })).toEqual({ refreshThrows: true, invalid: true, missing: true, empty: true, unchanged: true });
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', "delete globalThis.window; delete globalThis.document; const ui = await import('@morfira-dev/wysiwyg/ui/contextual-table'); if (typeof ui.createContextualTableUI !== 'function') throw new Error('Missing factory');"], { encoding: 'utf8' });
  expect(output).toBe('');
});
