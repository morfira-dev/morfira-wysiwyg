import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/office/${name}`, import.meta.url), 'utf8');
const paste = (page: Page, html: string, text = '') => page.evaluate(({ html, text }) => {
  const clipboard = new DataTransfer();
  clipboard.setData('text/html', html);
  clipboard.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboard });
  window.editor.surface.dispatchEvent(event);
}, { html, text });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.editor.setHTML('<p>Replace</p><p>Unchanged</p>');
    window.editor.setSelection(0, 7);
    window.changes.length = 0;
  });
});

test('external clipboard corpus retains pinned payload bytes and explicit provenance', () => {
  const manifest = JSON.parse(fixture('manifest.json')) as { fixtures: { file: string; sha256: string; source: string; status: string }[] };
  for (const entry of manifest.fixtures) {
    const bytes = readFileSync(new URL(`./fixtures/office/${entry.file}`, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    if (entry.status.startsWith('upstream-')) expect(entry.source).toMatch(/^https:\/\/github\.com\//);
    else expect(entry.status).toBe('project-native-capture');
  }
});

for (const source of ['word-windows-edge.html', 'word-mac-safari.html']) {
  test(`documented Word clipboard ${source} retains nested bullets, literal unsupported labels and one undo`, async ({ page }) => {
    const before = await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }));
    await paste(page, fixture(source));
    const content = page.locator('.mw-content');
    await expect(content.locator('ul ul ul li').filter({ hasText: 'In the front pocket' })).toHaveCount(1);
    await expect(content.locator('ul > li').filter({ hasText: 'A hat' }).first()).toBeVisible();
    await expect(content).toContainText('Both parents');
    await expect(content).toContainText('Or a caregiver');
    // Alphabetic/Roman labels remain source text instead of inventing numbering.
    await expect(content).toContainText('a.');
    await expect(content.locator(':scope > p').last()).toHaveText('Unchanged');
    expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
    expect(await page.evaluate(() => window.editor.getHTML())).not.toMatch(/mso-|MsoList|docs-internal|<style|<meta/);
    await page.evaluate(() => window.editor.undo());
    expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual(before);
  });
}

test('documented Excel clipboard distinguishes real merges from overflow and preserves displayed values', async ({ page }) => {
  const before = await page.evaluate(() => window.editor.getHTML());
  await paste(page, fixture('excel-windows-chromium.html'), fixture('excel-windows-chromium.txt'));
  const table = page.locator('.mw-content table');
  await expect(table).toHaveCount(1);
  await expect(table.locator('tr')).toHaveCount(8);
  await expect(table.locator('tr').first().locator('td[colspan="3"]')).toHaveText('병합 헤더');
  await expect(table.locator('td[rowspan="2"]')).toHaveText('세로 병합');
  const overflow = table.locator('tr').nth(3);
  await expect(overflow.locator('td')).toHaveCount(3);
  await expect(overflow.locator('td').nth(0)).toContainText('앞뒤 공백');
  await expect(overflow.locator('td').nth(1)).toHaveText('');
  await expect(overflow.locator('td').nth(2)).toHaveText('50%');
  await expect(table).toContainText('1,234,567.89');
  await expect(table).toContainText('2024-01-15');
  await expect(table).toContainText('0012');
  await expect(table).toContainText('<b>not html</b> &');
  await expect(table).toContainText('😀');
  await expect(table.locator('tr').last().locator('td')).toHaveCount(3);
  await expect(table.locator('b')).toHaveCount(0);
  expect(await page.evaluate(() => window.editor.getHTML())).not.toMatch(/mso-|\.xl\d|file:|<style|<link|<meta|x:fmla|data-sheets/);
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
});

test('upstream Google Docs table sample preserves content and bounded column widths without unsafe layout styles', async ({ page }) => {
  await paste(page, fixture('google-docs-table.html'));
  const table = page.locator('.mw-content table');
  await expect(table).toHaveCount(1);
  await expect(table.locator('tr')).toHaveCount(2);
  await expect(table.locator('td')).toHaveCount(6);
  await expect(table.locator('td').first()).toHaveText('short');
  await expect(table.locator('td').nth(1)).toHaveText('wide');
  expect(await table.locator('span').first().evaluate((node) => (node as HTMLElement).style.fontSize)).toBe('14.667px');
  await expect(table.locator('col')).toHaveCount(3);
  expect(await table.locator('col').evaluateAll((columns) => columns.map((column) => column.getAttribute('width')))).toEqual(['78', '405', '233']);
  const html = await page.evaluate(() => window.editor.getHTML());
  expect(html).not.toMatch(/docs-internal-guid|<b\b|<style|<meta|border-left|padding:/);
  await expect(page.locator('.mw-content > strong')).toHaveCount(0);
  await page.evaluate(() => {
    window.editor.setHTML('<p>Replace</p>');
    window.editor.setSelection(0, 7);
  });
  await paste(page, fixture('google-docs-formatting.html'));
  const formatted = page.locator('.mw-content span').filter({ hasText: /^Bold Italic Underline$/ });
  expect(await formatted.evaluate((node) => ({ weight: (node as HTMLElement).style.fontWeight, italic: (node as HTMLElement).style.fontStyle, decoration: (node as HTMLElement).style.textDecoration })))
    .toEqual({ weight: '700', italic: 'italic', decoration: 'underline' });
  await expect(page.locator('.mw-content > strong')).toHaveCount(0);
});

test('Wingdings qualification and Excel overflow never discard unqualified labels or expand unsupported rowspan cells', async ({ page }) => {
  const result = await page.evaluate(() => {
    const paragraph = (font: string) => `<p style="mso-list:l0 level1 lfo1"><span style="font-family:${font}"><span style="mso-list:Ignore">§</span></span>Section</p>`;
    const unqualified = window.editor.schema.sanitizeHTML(paragraph('Arial'));
    const qualified = window.editor.schema.sanitizeHTML(paragraph('Wingdings'));
    const table = window.editor.schema.sanitizeHTML('<table><tr><td colspan="2" style="mso-ignore:colspan">A</td><td>B</td></tr></table>');
    const invalid = window.editor.schema.sanitizeHTML('<table><tr><td colspan="2" rowspan="2" style="mso-ignore:colspan">A</td><td>B</td></tr><tr><td>C</td></tr></table>');
    const protectedCell = window.editor.schema.sanitizeHTML('<figure data-mw-node="app:protected"><table><tr><td colspan="2" style="mso-ignore:colspan">A</td><td>B</td></tr></table></figure>');
    const override = window.editor.schema.sanitizeHTML('<p style="mso-list:l0 level1 lfo1"><span style="font-family:Wingdings"><span style="mso-list:Ignore;font-family:Arial">§</span></span>Section</p>');
    return { unqualified, qualified, table, invalid, protectedCell, override };
  });
  expect(result.unqualified).toContain('§');
  expect(result.unqualified).not.toContain('<ul>');
  expect(result.qualified).toContain('<ul>');
  expect(result.qualified).not.toContain('§');
  expect(result.table).not.toContain('colspan');
  expect(result.table.match(/<td/g)).toHaveLength(3);
  expect(result.invalid).toContain('colspan="2"');
  expect(result.protectedCell).toContain('colspan="2"');
  expect(result.override).toContain('§');
  expect(result.override).not.toContain('<ul>');
});

test('Excel overflow expansion keeps the source-node budget and rejects paste without changing history', async ({ page }) => {
  const before = await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }));
  const source = '<table><tr>' + '<td colspan="1000" style="mso-ignore:colspan">Value</td>'.repeat(101) + '</tr></table>';
  await paste(page, source);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual(before);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ undo: false, changes: 0 });
});


test('fresh native Google Docs clipboard retains paragraphs, intentional bold and bullet semantics with known text losses', async ({ page }) => {
  const plain = fixture('google-docs-native-chrome.txt');
  const labels = plain.split(/\r?\n/).filter(Boolean);
  expect(labels).toEqual(['Morfira Docs fixture', 'Plain alpha beta', 'Bold gamma', 'List delta']);
  const before = await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }));
  await paste(page, fixture('google-docs-native-chrome.html'), plain);
  const content = page.locator('.mw-content');
  await expect(content.locator('ul > li')).toHaveCount(1);
  await expect(content.locator('ul > li')).toHaveText('List delta');
  for (const label of labels) await expect(content).toContainText(label);
  const bold = content.locator('span').filter({ hasText: /^Bold gamma$/ });
  const normal = content.locator('span').filter({ hasText: /^Plain alpha beta$/ });
  expect(await bold.evaluate((node) => (node as HTMLElement).style.fontWeight)).toBe('700');
  expect(await normal.evaluate((node) => (node as HTMLElement).style.fontWeight)).toBe('400');
  expect(await normal.evaluate((node) => (node as HTMLElement).style.fontSize)).toBe('14.667px');
  await expect(content.locator(':scope > strong')).toHaveCount(0);
  const html = await page.evaluate(() => window.editor.getHTML());
  expect(html).not.toMatch(/docs-internal-guid|<meta|aria-level|role=|padding-inline|margin-top|margin-bottom/);
  expect(await content.locator('p').evaluateAll((paragraphs) => paragraphs.map((node) => node.style.lineHeight)))
    .toEqual(['1.38', '1.38', '1.38', '1.38', '']);
  await expect(content.locator(':scope > p').last()).toHaveText('Unchanged');
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual(before);
});
