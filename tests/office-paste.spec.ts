import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { excelTableHTML, googleDocsHTML, wordListHTML } from './office-paste.fixture.js';

const initialize = async (page: Page, value = '<p>Replace</p><p>Keep</p>', tables = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ value, tables }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, {
      value,
      plugins: tables ? [window.createTables()] : [],
      onChange: (change) => window.changes.push(change),
    });
    window.dispose = () => window.editor.destroy();
    window.editor.focus();
    window.editor.setSelection(0, 7);
  }, { value, tables });
};
const paste = (page: Page, html: string, text = 'Plain fallback') => page.evaluate(({ html, text }) => {
  const data = new DataTransfer();
  data.setData('text/html', html);
  data.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, { html, text });
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

test('Word list metadata becomes semantic nested lists without labels and remains one selection-preserving history edit', async ({ page }) => {
  await initialize(page);
  const before = await html(page);
  const selected = await page.evaluate(() => window.editor.getSelection());
  expect(await paste(page, wordListHTML)).toBe(true);
  const list = page.locator('.mw-content > ol');
  await expect(list).toHaveCount(1);
  await expect(list).toHaveAttribute('start', '3');
  await expect(list.locator(':scope > li')).toHaveCount(2);
  await expect(list.locator('li ul > li')).toHaveText('Nested');
  await expect(list.locator(':scope > li').first().locator('strong')).toHaveText('Third');
  await expect(list.locator(':scope > li').last()).toHaveText('Fourth');
  expect(await html(page)).not.toMatch(/MsoList|mso-|urn:schemas|3\.|4\.|•|Plain fallback/);
  await expect(page.locator('.mw-content > p').last()).toHaveText('Keep');
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  const after = await html(page);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual(selected);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(after);
});

test('Google Docs neutral outer bold wrapper does not bold the document and preserves intentional inline formatting', async ({ page }) => {
  await initialize(page);
  await paste(page, googleDocsHTML);
  await expect(page.locator('.mw-content h2')).toHaveText('Heading');
  await expect(page.locator('.mw-content h2 strong')).toHaveCount(0);
  await expect(page.locator('.mw-content > strong')).toHaveCount(0);
  await expect(page.locator('.mw-content a')).toHaveAttribute('href', 'https://example.com/docs');
  await expect(page.locator('.mw-content em')).toHaveText(' italic');
  const weights = await page.locator('.mw-content').evaluate((root) => {
    const paragraph = [...root.querySelectorAll('p')].find((node) => node.textContent?.startsWith('Plain '))!;
    const nodes = [...paragraph.querySelectorAll('span')];
    return nodes.map((node) => ({ text: node.textContent, weight: getComputedStyle(node).fontWeight }));
  });
  expect(weights).toEqual([{ text: 'Plain ', weight: '400' }, { text: 'Bold', weight: '700' }]);
  await expect(page.locator('.mw-content ul li')).toHaveText('Item');
  await expect(page.locator('.mw-content strong')).toHaveText(['Still bold', 'Original bold']);
  expect(await html(page)).not.toMatch(/docs-internal-guid|<meta|Plain fallback/);
});

test('Excel semantic HTML takes precedence over TSV and preserves merged content in a selected destination rectangle', async ({ page }) => {
  await initialize(page, '<table><tr><td>A</td><td>B</td><td>Outside</td></tr><tr><td>C</td><td>D</td><td>Keep</td></tr></table><p>After</p>', true);
  await page.locator('.mw-content td').first().click();
  await page.evaluate(() => window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 1, column: 1 }));
  const before = await html(page);
  await paste(page, excelTableHTML, 'wrong\twrong\r\nwrong\twrong');
  await expect(page.locator('.mw-content table')).toHaveCount(1);
  await expect(page.locator('.mw-content td[rowspan="2"]')).toHaveText('42');
  await expect(page.locator('.mw-content td[rowspan="2"]')).toHaveCSS('background-color', 'rgb(255, 255, 0)');
  await expect(page.locator('.mw-content strong')).toHaveText('North');
  await expect(page.locator('.mw-content tr').nth(1).locator('td').first()).toHaveText('South');
  await expect(page.locator('.mw-content tr').first().locator('td').last()).toHaveText('Outside');
  await expect(page.locator('.mw-content tr').nth(1).locator('td').last()).toHaveText('Keep');
  expect(await html(page)).not.toMatch(/wrong|mso-|x:num|class=|xmlns/);
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('Office cleanup cannot bypass URL, namespace and executable-markup filtering', async ({ page }) => {
  await initialize(page);
  await paste(page, '<b id="docs-internal-guid-untrusted" style="font-weight:normal"><p onclick="alert(1)">Safe<a href="javascript:alert(1)"> link</a><span style="color:red;background-image:url(https://example.invalid/probe)"> color</span><script>alert(1)</script><svg><text>Foreign</text></svg><o:p xmlns:o="urn:schemas-microsoft-com:office:office">Office</o:p></p></b>');
  const output = await html(page);
  expect(output).toContain('Safe');
  expect(output).toContain(' link');
  expect(output).toContain('color: red');
  expect(output).not.toMatch(/onclick|javascript|background-image|example.invalid|script|alert|svg|Foreign|docs-internal-guid|xmlns/);
  await expect(page.locator('.mw-content > strong')).toHaveCount(0);
});

test('over-deep Office markers and guarded paste preserve content, selection and pending redo', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    window.editor.insertHTML('<strong>X</strong>');
    window.editor.undo();
    window.editor.setSelection(0, 7);
    window.changes = [];
  });
  const before = await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo(), redo: window.editor.canRedo() }));
  // Cleanup removes this marker only after the original source passes its depth budget.
  const marker = '<span>'.repeat(101) + '1.' + '</span>'.repeat(101);
  await paste(page, '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">' + marker + '</span>Too deep</p>');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo(), redo: window.editor.canRedo() }))).toEqual(before);
  for (const mode of ['read-only', 'composition'] as const) {
    await page.evaluate((mode) => {
      if (mode === 'read-only') window.editor.setReadOnly(true);
      else window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    }, mode);
    await paste(page, wordListHTML);
    expect(await html(page)).toBe(before.html);
    expect(await page.evaluate(() => window.changes.length)).toBe(0);
    await page.evaluate((mode) => {
      if (mode === 'read-only') window.editor.setReadOnly(false);
      else window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    }, mode);
  }
  expect(await page.evaluate(() => window.editor.canRedo())).toBe(true);
});


test('unsupported Word labels and level jumps retain their visible content instead of inventing list structure', async ({ page }) => {
  await initialize(page);
  await paste(page, '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">i.</span>Roman</p><p style="mso-list:l1 level3 lfo2"><span style="mso-list:Ignore">1.</span>Jumped</p>');
  await expect(page.locator('.mw-content ol,.mw-content ul')).toHaveCount(0);
  expect(await page.locator('.mw-content').textContent()).toContain('i.Roman');
  expect(await page.locator('.mw-content').textContent()).toContain('1.Jumped');
  expect(await html(page)).not.toContain('mso-list');
  const boundaries = await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.append(host);
    const editor = window.createEditor(host, {
      schema: [{ name: 'test:office-marker', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } }],
    });
    try {
      const source = '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>First</p>'
        + '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">3.</span>Gap</p>'
        + '<p style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">4.</span>New identity</p>'
        + '<p style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">•</span>New kind</p>'
        + '<p style="mso-list:l1 level1 lfo2"><span data-mw-node="test:office-marker" data-id="kept" style="mso-list:Ignore">5.</span>Semantic</p>'
        + '<p style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore"><a href="https://example.com/marker">6.</a></span>Anchor</p>';
      const template = document.createElement('template');
      template.innerHTML = editor.schema.sanitizeHTML(source);
      const roots = [...template.content.children];
      return {
        lists: roots.filter((node) => node.matches('ol,ul')).map((node) => ({ tag: node.localName, start: node.getAttribute('start'), text: node.textContent })),
        paragraphs: roots.filter((node) => node.localName === 'p').map((node) => node.textContent),
        semantic: template.content.querySelector('[data-mw-node="test:office-marker"]')?.getAttribute('data-id'),
        anchor: template.content.querySelector('a')?.getAttribute('href'),
      };
    } finally {
      editor.destroy();
      host.remove();
    }
  });
  expect(boundaries).toEqual({
    lists: [
      { tag: 'ol', start: null, text: 'First' },
      { tag: 'ol', start: '3', text: 'Gap' },
      { tag: 'ol', start: '4', text: 'New identity' },
      { tag: 'ul', start: null, text: 'New kind' },
    ],
    paragraphs: ['5.Semantic', '6.Anchor'],
    semantic: 'kept',
    anchor: 'https://example.com/marker',
  });
});
