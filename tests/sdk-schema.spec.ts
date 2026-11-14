import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const nodes: SchemaNodeSpec[] = [
  { name: 'test:callout', kind: 'block', tag: 'blockquote', attributes: { 'data-tone': { type: 'enum', values: ['note', 'warning'], required: true }, 'data-count': { type: 'integer', min: 0, max: 10 } } },
  { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', maxLength: 16, required: true }, 'data-url': { type: 'url' } } },
];
const rich = '<blockquote data-mw-node="test:callout" data-tone="note" data-count="2"><p>Alpha <span data-mw-node="test:reference" data-id="42" data-url="https://example.com">Beta</span></p></blockquote><p>Tail</p>';
const initialize = async (page: Page, html = rich) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ nodes, html }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value: html, schema: [nodes[0]], plugins: [{ name: 'test-reference', schema: [nodes[1]], setup: () => {} }], onChange: (change) => window.changes.push(change) });
  }, { nodes, html });
};

test('schema contributions compile before initial import and retain rich block/inline metadata through HTML and JSON', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(rich);
  const result = await page.evaluate(() => {
    const json = window.editor.getJSON();
    window.editor.setHTML('<p>Other</p>');
    window.editor.setJSON(json);
    return { version: json.version, html: window.editor.getHTML(), frozen: Object.isFrozen(window.editor.schema) };
  });
  expect(result).toEqual({ version: 1, html: rich, frozen: true });
  await expect(page.locator('.mw-content [data-mw-node="test:reference"]')).toHaveText('Beta');
});

test('native typing, formatting and history retain semantic metadata and unaffected inline content', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.editor.setSelection(2));
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content blockquote')).toHaveAttribute('data-tone', 'note');
  await expect(page.locator('.mw-content [data-id="42"]')).toHaveText('Beta');
  expect(await page.evaluate(() => window.editor.getJSON().children[0])).toMatchObject({ type: 'element', attributes: { 'data-mw-node': 'test:callout', 'data-tone': 'note' } });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(rich);
  await page.evaluate(() => window.editor.redo());
  await expect(page.locator('.mw-content blockquote')).toContainText('AlXpha');
  await page.evaluate(() => {
    window.editor.setSelection(7, 4);
    window.editor.format('bold', true);
  });
  await expect(page.locator('.mw-content [data-id="42"]')).toHaveText('Beta');
  await expect(page.locator('.mw-content strong')).toContainText('Beta');
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.mw-content strong')).toHaveCount(0);
  await expect(page.locator('.mw-content blockquote')).toHaveAttribute('data-count', '2');
});

test('schema-aware insertion and paste preserve metadata and one-step history', async ({ page }) => {
  await initialize(page, '<p>Start</p>');
  await page.evaluate(() => {
    window.editor.setSelection(5);
    window.editor.insertHTML('<span data-mw-node="test:reference" data-id="inserted">Link</span>');
  });
  await expect(page.locator('.mw-content [data-id="inserted"]')).toHaveText('Link');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Start</p>');
  await page.evaluate(() => {
    window.editor.setSelection(5);
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<span data-mw-node="test:reference" data-id="pasted">Paste</span>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    window.editor.surface.dispatchEvent(event);
  });
  await expect(page.locator('.mw-content [data-id="pasted"]')).toHaveText('Paste');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Start</p>');
});

test('invalid registered HTML and JSON fail atomically without destroying history or a pending selection', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.editor.setSelection(0, 5);
    window.editor.format('italic', true);
    const before = window.editor.getHTML();
    const selection = window.editor.getSelection();
    const failures: string[] = [];
    for (const html of [
      '<blockquote data-mw-node="test:callout"><p>Missing</p></blockquote>',
      '<span data-mw-node="test:callout" data-tone="note">Mismatch</span>',
      '<section data-mw-node="test:callout" data-tone="note">Unsupported wrapper</section>',
      '<blockquote data-mw-node="test:callout" data-tone="danger">Enum</blockquote>',
      '<span data-mw-node="test:reference" data-id="x" data-url="javascript:alert(1)">URL</span>',
      '<blockquote data-mw-node="test:callout" data-tone="note" data-count="11">Integer</blockquote>',
    ]) {
      try { window.editor.setHTML(html); }
      catch { failures.push(window.editor.getHTML()); }
    }
    const json = window.editor.getJSON();
    const first = json.children[0];
    if (first.type === 'element') first.attributes['data-mw-node'] = 'missing:node';
    try { window.editor.setJSON(json); }
    catch { failures.push(window.editor.getHTML()); }
    return { before, failures, selection, afterSelection: window.editor.getSelection(), canUndo: window.editor.canUndo() };
  });
  expect(result.failures).toEqual(Array(7).fill(result.before));
  expect(result.afterSelection).toEqual(result.selection);
  expect(result.canUndo).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(rich);
});

test('schema-aware transactions reject malformed metadata and roll back text, attributes and history', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    try {
      window.editor.transact((surface) => {
        surface.querySelector('blockquote')!.setAttribute('data-tone', 'invalid');
        surface.querySelector('p')!.textContent = 'Should roll back';
      });
      return false;
    }
    catch { return true; }
  })).toBe(true);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(rich);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('unknown HTML metadata is stripped and schema declarations never allow executable attributes or foreign namespaces', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.editor.setHTML('<p data-mw-node="missing:node" data-id="lost" onclick="alert(1)">Safe</p><svg><text data-mw-node="test:reference" data-id="x">SVG</text></svg><a href="javascript:alert(1)" data-mw-node="missing:link">Link</a>'));
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Safe</p><p><a>Link</a></p>');
  await page.evaluate(() => window.editor.setHTML('<span data-mw-node="test:reference" data-id="&lt;&amp;&quot;&gt;">Label</span>'));
  expect(await page.evaluate(() => window.editor.getJSON().children[0])).toMatchObject({ tag: 'p', children: [{ tag: 'span', attributes: { 'data-id': '<&\">' } }] });
  await expect(page.locator('.mw-content img')).toHaveCount(0);
});

test('schema definitions are copied and remain isolated per instance; read-only still permits external synchronization', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(({ nodes, rich }) => {
    const host = document.createElement('div');
    document.body.append(host);
    const other = window.createEditor(host, { value: rich });
    const stripped = other.getHTML();
    let unknownRejected = false;
    try { other.setJSON(window.editor.getJSON()); }
    catch { unknownRejected = true; }
    const values = ['note', 'warning'];
    const mutable = [{ ...nodes[0], attributes: { 'data-tone': { type: 'enum' as const, values, required: true } } }];
    const thirdHost = document.createElement('div');
    document.body.append(thirdHost);
    const third = window.createEditor(thirdHost, { schema: mutable });
    values.splice(0, values.length, 'changed');
    mutable[0].tag = 'p';
    third.setHTML('<blockquote data-mw-node="test:callout" data-tone="note">Copied</blockquote>');
    third.setReadOnly(true);
    third.transact((surface) => { surface.textContent = 'Blocked'; });
    const before = third.getHTML();
    third.setHTML('<blockquote data-mw-node="test:callout" data-tone="warning">External</blockquote>');
    const external = third.getHTML();
    other.destroy();
    third.destroy();
    return { stripped, unknownRejected, before, external };
  }, { nodes, rich });
  expect(result.stripped).not.toContain('data-');
  expect(result.stripped).toContain('Alpha');
  expect(result.unknownRejected).toBe(true);
  expect(result.before).toContain('Copied');
  expect(result.external).toContain('External');
});

test('invalid and duplicate schema definitions fail before mounting or plugin setup', async ({ page }) => {
  await initialize(page);
  const results = await page.evaluate(({ nodes }) => {
    const invalid = [
      [nodes[0], nodes[0]],
      [{ name: 'no-namespace', kind: 'inline', tag: 'span' }],
      [{ name: 'test:event', kind: 'inline', tag: 'span', attributes: { onclick: { type: 'text' } } }],
      [{ name: 'test:reserved', kind: 'inline', tag: 'span', attributes: { 'data-mw-node': { type: 'text' } } }],
      [{ name: 'test:tag', kind: 'block', tag: 'span' }],
      [{ name: 'test:custom', kind: 'block', tag: 'script' }],
      [{ name: 'test:bounds', kind: 'inline', tag: 'span', attributes: { 'data-n': { type: 'integer', min: 3, max: 1 } } }],
      [{ name: 'test:enum', kind: 'inline', tag: 'span', attributes: { 'data-v': { type: 'enum', values: [] } } }],
      [{ name: 'test:prototype', kind: 'inline', tag: 'span', attributes: JSON.parse('{"__proto__":{"type":"text"}}') }],
    ];
    return invalid.map((schema) => {
      const host = document.createElement('div');
      let setup = 0;
      try {
        window.createEditor(host, { schema: schema as typeof nodes, plugins: [{ name: 'setup', setup: () => { setup++; } }] });
        return { rejected: false, children: host.childNodes.length, setup };
      }
      catch { return { rejected: true, children: host.childNodes.length, setup }; }
    });
  }, { nodes });
  expect(results).toEqual(Array(9).fill({ rejected: true, children: 0, setup: 0 }));
});

test('public schema codec renders only validated data and default sanitizer never retains extension metadata', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async ({ nodes, rich }) => {
    const modulePath = '/packages/core/dist/index.js';
    const { createDocumentSchema, sanitizeHTML } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const schema = createDocumentSchema(nodes);
    const imported = schema.parseHTML(rich);
    const untrusted = { version: 1, children: [{ type: 'element', tag: 'script', attributes: {}, children: [{ type: 'text', text: 'alert(1)' }] }] };
    let rejected = 0;
    for (const render of [schema.renderDocument, schema.documentHTML]) {
      try { render(untrusted as typeof imported); }
      catch { rejected++; }
    }
    return { html: schema.documentHTML(imported), sanitized: sanitizeHTML(rich), rejected };
  }, { nodes, rich });
  expect(result.html).toBe(rich);
  expect(result.sanitized).not.toContain('data-');
  expect(result.rejected).toBe(2);
});

for (const format of ['bold', 'clear', 'color', 'link']) test(`inline semantic identity survives ${format} and undo`, async ({ page }) => {
  const initial = rich.replace('>Beta</span>', '><strong>Beta</strong></span>');
  await initialize(page, initial);
  await page.evaluate((format) => {
    window.editor.setSelection(6, 4);
    window.editor.format(format, format === 'color' ? '#123456' : format === 'link' ? { href: 'https://example.com/link' } : format === 'bold' ? false : true);
  }, format);
  await expect(page.locator('.mw-content [data-id="42"]')).toHaveText('Beta');
  await expect(page.locator('.mw-content [data-id="42"]')).toHaveAttribute('data-mw-node', 'test:reference');
  if (format === 'link') await expect(page.locator('.mw-content a')).toHaveText('Beta');
  else if (format === 'bold' || format === 'clear') await expect(page.locator('.mw-content strong')).toHaveCount(0);
  else expect(await page.evaluate(() => window.editor.getHTML())).toContain('color:');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(initial);
  await page.evaluate(() => window.editor.redo());
  await expect(page.locator('.mw-content [data-id="42"]')).toHaveText('Beta');
});

test('table range copy and paste preserve semantic metadata inside merged cells with atomic undo', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(({ nodes, rich }) => {
    window.editor.destroy();
    const host = document.createElement('div');
    document.body.append(host);
    window.editor = window.createEditor(host, {
      schema: nodes,
      plugins: [window.createTables()],
      value: `<table><tbody><tr><td rowspan="2">${rich}</td><td>Keep</td></tr><tr><td>Other</td></tr></tbody></table><table><tbody><tr><td><p>Target1</p></td></tr><tr><td><p>Target2</p></td></tr></tbody></table><p><br></p>`,
    });
    return window.editor.getHTML();
  }, { nodes, rich });
  // A pointer click clears the previous explicit table range before selecting a new table.
  await page.locator('.mw-content table').first().locator('td').first().click();
  const clipboard = await page.evaluate(() => {
    window.tableCommands(window.editor).select({ row: 0, column: 0 });
    return window.tableCommands(window.editor).copy();
  });
  expect(clipboard.html).toContain('data-mw-node="test:reference"');
  await page.locator('.mw-content table').nth(1).locator('td').first().click();
  await page.evaluate((clipboard) => {
    window.tableCommands(window.editor).select({ row: 0, column: 0 });
    window.tableCommands(window.editor).paste(clipboard);
  }, clipboard);
  const target = page.locator('.mw-content table').nth(1);
  await expect(target.locator('td[rowspan="2"]')).toHaveCount(1);
  await expect(target.locator('[data-id="42"]')).toHaveText('Beta');
  await expect(target.locator('blockquote')).toHaveAttribute('data-tone', 'note');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => window.editor.redo());
  await expect(target.locator('[data-id="42"]')).toHaveText('Beta');
  await expect(page.locator('.mw-content table').first().locator('[data-id="42"]')).toHaveText('Beta');
});

test('registered markers cannot exploit HTML aliases to change their declared wrapper', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createDocumentSchema } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const schema = createDocumentSchema([{ name: 'test:paragraph', kind: 'block', tag: 'p' }]);
    try { schema.parseHTML('<div data-mw-node="test:paragraph">Alias</div>'); }
    catch { return true; }
    return false;
  })).toBe(true);
});
