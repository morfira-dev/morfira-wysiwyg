import { expect, test } from '@playwright/test';

test('string-only codecs never fetch image resources while explicit rendering retains insertable images', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/__morfira_codec_probe__*', async (route) => {
    requests.push(new URL(route.request().url()).searchParams.get('phase')!);
    await route.abort();
  });
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const output = await page.evaluate(async () => {
    const modulePath = '/packages/core/dist/index.js';
    const { createDocumentSchema, sanitizeHTML } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg');
    const schema = createDocumentSchema();
    schema.parseHTML('<img src="/__morfira_codec_probe__?phase=parse">');
    return [
      sanitizeHTML('<img src="/__morfira_codec_probe__?phase=sanitize">'),
      schema.sanitizeHTML('<img src="/__morfira_codec_probe__?phase=schema-sanitize">'),
      schema.documentHTML(schema.parseHTML('<img src="/__morfira_codec_probe__?phase=serialize">')),
    ];
  });
  expect(output).toEqual(['sanitize', 'schema-sanitize', 'serialize'].map((phase) => `<img src="/__morfira_codec_probe__?phase=${phase}">`));
  // Observe the native resource scheduling turn; every matching request is aborted locally.
  await page.waitForTimeout(150);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => {
    const fragment = window.editor.schema.renderDocument({ version: 1, children: [{ type: 'element', tag: 'img', attributes: { src: '/__morfira_codec_probe__?phase=render' }, children: [] }] });
    return { fragment: fragment instanceof DocumentFragment, image: fragment.querySelector('img')?.getAttribute('src') };
  })).toEqual({ fragment: true, image: '/__morfira_codec_probe__?phase=render' });
  await expect.poll(() => requests).toEqual(['render']);
});

test('aggregate retained JSON attributes reject before rendering and leave editor state atomic', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<p>Safe</p>');
    editor.setSelection(2);
    editor.format('bold', true);
    const before = { html: editor.getHTML(), selection: editor.getSelection(), formats: editor.getFormats(), undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    const node = { type: 'element' as const, tag: 'p' as const, attributes: { title: 'A'.repeat(6000) }, children: [] };
    const input = { version: 1 as const, children: Array.from({ length: 900 }, () => node) };
    const rejected: boolean[] = [];
    for (const action of [() => editor.schema.validateDocument(input), () => editor.schema.renderDocument(input), () => editor.schema.documentHTML(input), () => editor.setJSON(input)]) {
      try { action(); rejected.push(false); } catch (error) { rejected.push(error instanceof RangeError); }
    }
    const after = { html: editor.getHTML(), selection: editor.getSelection(), formats: editor.getFormats(), undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    return { rejected, same: JSON.stringify(before) === JSON.stringify(after) };
  })).toEqual({ rejected: [true, true, true, true], same: true });
});

test('escaping-heavy JSON and normalized HTML reject without changing content, caret or history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<p>Before</p>');
    editor.setSelection(2);
    editor.insertHTML('X');
    const before = { html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    const rejected: boolean[] = [];
    const text = '<'.repeat(1250000);
    const actions = [
      () => editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text }] }] }),
      () => editor.setHTML(`<p>${text}</p>`),
      () => editor.schema.validateDocument({ version: 1, children: Array.from({ length: 42 }, () => ({ type: 'element', tag: 'p', attributes: { title: '"'.repeat(20000) }, children: [] })) }),
    ];
    for (const action of actions) {
      try { action(); rejected.push(false); } catch (error) { rejected.push(error instanceof RangeError); }
    }
    const after = { html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    editor.undo();
    return { rejected, same: JSON.stringify(before) === JSON.stringify(after), undoRestored: editor.getHTML() };
  })).toEqual({ rejected: [true, true, true], same: true, undoRestored: '<p>Before</p>' });
});

test('serialized budget counts UTF-16 and syntax at the limit while valid escaping round-trips safely', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  expect(await page.evaluate(() => {
    const schema = window.editor.schema;
    // P syntax is seven code units. Each non-BMP symbol occupies two.
    const text = '😀'.repeat(2499996) + 'A';
    const value = { version: 1 as const, children: [{ type: 'element' as const, tag: 'p' as const, attributes: {}, children: [{ type: 'text' as const, text }] }] };
    const html = schema.documentHTML(value);
    const valid = schema.validateDocument(schema.parseHTML(html));
    let rejected = false;
    try { schema.validateDocument({ ...value, children: [{ ...value.children[0]!, children: [{ type: 'text', text: text + 'B' }] }] }); } catch (error) { rejected = error instanceof RangeError; }
    const escaped = schema.documentHTML(schema.parseHTML('<p title="&quot;&amp;&lt;&gt;&nbsp;">&amp;&lt;&gt;&nbsp;😀</p>'));
    const paragraph = valid.children[0];
    // WebKit splits long parser text into multiple adjacent Text nodes.
    const restored = paragraph?.type === 'element' && paragraph.children.every((child) => child.type === 'text')
      ? paragraph.children.map((child) => child.type === 'text' ? child.text : '').join('') : undefined;
    return { length: html.length, roundTrip: restored === text, rejected, escapedRoundTrip: schema.documentHTML(schema.parseHTML(escaped)) === escaped };
  })).toEqual({ length: 5000000, roundTrip: true, rejected: true, escapedRoundTrip: true });
});

test('oversized or sparse runtime child arrays and cycles reject without mapping huge arrays', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  expect(await page.evaluate(() => {
    const schema = window.editor.schema;
    const cycle: { type: 'element'; tag: 'p'; attributes: Record<string, string>; children: unknown[] } = { type: 'element', tag: 'p', attributes: {}, children: [] };
    cycle.children.push(cycle);
    const node = { type: 'element', tag: 'p', attributes: {}, children: [] };
    const inputs = [
      { version: 1, children: new Array(100001) },
      { version: 1, children: new Array(1) },
      { version: 1, children: [{ ...node, children: new Array(100001) }] },
      { version: 1, children: [cycle] },
    ];
    return inputs.map((input) => {
      try { schema.validateDocument(input); return false; } catch (error) { return error instanceof RangeError || error instanceof TypeError; }
    });
  })).toEqual([true, true, true, true]);
});
