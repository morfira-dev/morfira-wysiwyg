import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const heights = ['32px', '72px', '12em', '96px'];
const sample = '<table><caption><em>Preserved caption</em></caption><thead><tr style="height:32px"><th scope="col" title="H0"><p>Head</p></th><th scope="col"><p>Second</p></th><th scope="col"><p>Third</p></th></tr></thead><tbody><tr style="height:72px"><td title="A" rowspan="2"><p><strong>Alpha</strong></p></td><td title="B"><p>Beta</p></td><td><p>Outside</p></td></tr><tr style="height:12em"><td title="D"><p>Delta</p></td><td><p>Other</p></td></tr><tr style="height:96px"><td title="F"><p>Final</p></td><td><p>Middle</p></td><td title="I"><p>Last</p></td></tr></tbody></table><p>After</p>';
const initialize = async (page: Page, value = sample) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((html) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    window.editor = window.createEditor(host, { value: html, plugins: [window.createTables()] });
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, value);
};
const focusCell = async (page: Page, title: string) => page.evaluate((name) => {
  const surface = window.editor.surface;
  const cell = [...surface.querySelectorAll('td,th')].find((element) => element.getAttribute('title') === name)!;
  surface.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  const native = document.getSelection()!;
  native.removeAllRanges();
  native.addRange(range);
}, title);
const readHeights = async (page: Page) => page.evaluate(() => [...window.editor.surface.querySelector('table')!.rows].map((row) => row.style.height));

test('column edits keep row minima and existing cells through merged geometry, with one Undo each', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  for (const operation of ['columnLeft', 'columnRight', 'deleteColumn'] as const) {
    await focusCell(page, 'B');
    expect(await page.evaluate((operation) => {
      const table = window.editor.surface.querySelector('table')!;
      const caption = table.caption!;
      const merged = table.querySelector('[title=A]')!;
      const strong = merged.querySelector('strong')!;
      window.tableCommands(window.editor)[operation]();
      return table === window.editor.surface.querySelector('table') && table.caption === caption
        && table.querySelector('[title=A]') === merged && merged.querySelector('strong') === strong;
    }, operation)).toBe(true);
    expect(await readHeights(page)).toEqual(heights);
    await page.evaluate(() => window.editor.undo());
    expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  }
});

test('row insertion shifts heights around an unset row, including inside rowspan and keyboard append', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  await focusCell(page, 'D');
  await page.evaluate(() => window.tableCommands(window.editor).rowAbove());
  expect(await readHeights(page)).toEqual(['32px', '72px', '', '12em', '96px']);
  await expect(page.locator('td[title=A]')).toHaveAttribute('rowspan', '3');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await focusCell(page, 'A');
  await page.evaluate(() => window.tableCommands(window.editor).rowBelow());
  expect(await readHeights(page)).toEqual(['32px', '72px', '12em', '', '96px']);
  await page.evaluate(() => window.editor.undo());
  await focusCell(page, 'I');
  await page.keyboard.press('Tab');
  expect(await readHeights(page)).toEqual([...heights, '']);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
});

test('deleting either origin or covered row removes only that row minimum and preserves spanning content', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  for (const title of ['B', 'D']) {
    await focusCell(page, title);
    expect(await page.evaluate(() => {
      const cell = window.editor.surface.querySelector('[title=A]')!;
      const strong = cell.querySelector('strong')!;
      window.tableCommands(window.editor).deleteRow();
      return cell === window.editor.surface.querySelector('[title=A]') && cell.querySelector('strong') === strong;
    })).toBe(true);
    expect(await readHeights(page)).toEqual(title === 'B' ? ['32px', '12em', '96px'] : ['32px', '72px', '96px']);
    await expect(page.locator('td[title=A]')).not.toHaveAttribute('rowspan');
    await page.evaluate(() => window.editor.undo());
    expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  }
});

test('merge, split and target paste retain row minima while clipboard omits source row heights', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  await focusCell(page, 'A');
  await page.evaluate(() => {
    const api = window.tableCommands(window.editor);
    api.select({ row: 1, column: 0 }, { row: 2, column: 1 });
    api.merge();
  });
  expect(await readHeights(page)).toEqual(heights);
  const merged = await page.evaluate(() => window.editor.getHTML());
  await focusCell(page, 'A');
  await page.evaluate(() => window.tableCommands(window.editor).split());
  expect(await readHeights(page)).toEqual(heights);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(merged);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await focusCell(page, 'F');
  const clipboard = await page.evaluate(() => {
    const api = window.tableCommands(window.editor);
    api.paste({ html: '<table><tbody><tr style="height:900px"><td>One</td><td>Two</td></tr><tr style="height:800px"><td>Three</td><td>Four</td></tr><tr style="height:700px"><td>Five</td><td>Six</td></tr></tbody></table>' });
    api.select({ row: 3, column: 0 }, { row: 5, column: 1 });
    return api.copy().html;
  });
  expect(await readHeights(page)).toEqual([...heights, '', '']);
  await expect(page.locator('caption em')).toHaveText('Preserved caption');
  expect(await page.evaluate((html) => {
    const template = document.createElement('template');
    template.innerHTML = html;
    return [...template.content.querySelectorAll('tr')].every((row) => !row.style.height);
  }, clipboard)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
});

test('readonly, composition and rejected grid growth cannot lose stored heights or add history', async ({ page }) => {
  const value = `<table><tbody>${Array.from({ length: 100 }, (_, index) => `<tr style="height:${index + 1}px"><td title="R${index}"><p>Row ${index}</p></td></tr>`).join('')}</tbody></table><p>After</p>`;
  await initialize(page, value);
  await focusCell(page, 'R99');
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => {
    const api = window.tableCommands(window.editor);
    window.editor.setReadOnly(true);
    api.columnRight();
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    api.rowBelow();
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    window.editor.surface.focus();
    const cell = window.editor.surface.querySelector('[title=R99]')!;
    document.getSelection()!.setBaseAndExtent(cell, 0, cell, 0);
    let rejected = false;
    try { api.rowBelow(); } catch { rejected = true; }
    return { rejected, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ rejected: true, html: before, undo: false });
});
