import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { markdownDocumentSample, markdownTableSample } from './markdown-codec.fixture.js';
import './markdown-codec.types.js';

test('Markdown imports supported rich blocks and canonical export preserves their document semantics', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const result = await page.evaluate(async (source) => {
    const path = '/packages/wysiwyg/dist/codecs/markdown.js';
    const { parseMarkdown, serializeMarkdown } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/codecs/markdown');
    const parsed = parseMarkdown(source);
    const html = window.editor.schema.documentHTML(parsed);
    const template = document.createElement('template');
    template.innerHTML = html;
    return {
      roundTrip: window.editor.schema.documentHTML(parseMarkdown(serializeMarkdown(parsed))) === html,
      heading: template.content.querySelector('h1')?.textContent,
      strong: template.content.querySelector('strong')?.textContent,
      emphasis: template.content.querySelector('em')?.textContent,
      strike: template.content.querySelector('s')?.textContent,
      link: template.content.querySelector('a')?.getAttribute('href'),
      image: template.content.querySelector('img')?.getAttribute('src'),
      complexLabel: template.content.querySelectorAll('a')[1]?.textContent,
      breaks: template.content.querySelectorAll('br').length,
      start: template.content.querySelector('ol')?.getAttribute('start'),
      nested: template.content.querySelector('ol ul li')?.textContent,
      quote: template.content.querySelector('blockquote')?.textContent,
      code: template.content.querySelector('pre')?.textContent?.trim(),
      rule: template.content.querySelectorAll('hr').length,
    };
  }, markdownDocumentSample);
  expect(result).toEqual({ roundTrip: true, heading: 'Codec', strong: 'bold', emphasis: 'emphasis', strike: 'removed', link: 'https://example.com', image: '/logo.svg', complexLabel: 'a ] label', breaks: 1, start: '3', nested: 'Nested', quote: 'A quote', code: 'const value = 1;', rule: 1 });
});

test('raw HTML stays literal and unsafe Markdown destinations never become executable nodes or URLs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const result = await page.evaluate(async () => {
    const path = '/packages/wysiwyg/dist/codecs/markdown.js';
    const { parseMarkdown, serializeMarkdown } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/codecs/markdown');
    const source = '<img src="https://example.invalid/probe" onerror="alert(1)"> &amp; [Danger](javascript:alert(1)) ![Unsafe image](data:image/png;base64,AA==)';
    const parsed = parseMarkdown(source);
    const template = document.createElement('template');
    template.innerHTML = window.editor.schema.documentHTML(parsed);
    const roundTrip = document.createElement('template');
    roundTrip.innerHTML = window.editor.schema.documentHTML(parseMarkdown(serializeMarkdown(parsed)));
    return {
      text: template.content.textContent,
      liveTags: template.content.querySelectorAll('img,a,script,svg').length,
      reparsedTags: roundTrip.content.querySelectorAll('img,a,script,svg').length,
      sameText: roundTrip.content.textContent === template.content.textContent,
    };
  });
  expect(result.text).toContain('<img src="https://example.invalid/probe" onerror="alert(1)"> &amp;');
  expect(result.text).toContain('Danger');
  expect(result.text).toContain('Unsafe image');
  expect(result).toMatchObject({ liveTags: 0, reparsedTags: 0, sameText: true });
});

test('export escapes accidental syntax and code delimiter collisions while visual styles have explicit text fallback', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const result = await page.evaluate(async () => {
    const path = '/packages/wysiwyg/dist/codecs/markdown.js';
    const { parseMarkdown, serializeMarkdown } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/codecs/markdown');
    const editor = window.editor;
    editor.setHTML('<p># literal **stars** [label](https://example.com) &lt;script&gt;</p><p><code>one ` two `` three **literal**</code></p><p><code>`x`</code></p><p><code>tail\\</code></p><pre><code>```\n&lt;script&gt;literal&lt;/script&gt;</code></pre><p>A<br><br>B<br></p><p style="color:red"><u>Plain fallback</u></p>');
    const before = editor.getJSON();
    const saved = JSON.stringify(before);
    const source = serializeMarkdown(before);
    const template = document.createElement('template');
    template.innerHTML = editor.schema.documentHTML(parseMarkdown(source));
    return {
      unchanged: JSON.stringify(before) === saved,
      first: template.content.firstElementChild?.textContent,
      accidental: template.content.querySelectorAll('h1,strong,a,script').length,
      inlineCode: [...template.content.querySelectorAll('p code')].map((node) => node.textContent),
      fencedCode: template.content.querySelector('pre')?.textContent?.trim(),
      fallback: template.content.lastElementChild?.textContent,
      hardBreaks: [...template.content.querySelectorAll('p')].find((node) => node.textContent === 'AB')?.querySelectorAll('br').length,
      visual: template.content.querySelectorAll('u,[style]').length,
    };
  });
  expect(result).toEqual({ unchanged: true, first: '# literal **stars** [label](https://example.com) <script>', accidental: 0, inlineCode: ['one ` two `` three **literal**', '`x`', 'tail\\'], fencedCode: '```\n<script>literal</script>', fallback: 'Plain fallback', hardBreaks: 3, visual: 0 });
});

test('simple pipe tables round trip and merged or nested source tables reject without flattening', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const result = await page.evaluate(async (source) => {
    const path = '/packages/wysiwyg/dist/codecs/markdown.js';
    const { parseMarkdown, serializeMarkdown } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/codecs/markdown');
    const parsed = parseMarkdown(source);
    const html = window.editor.schema.documentHTML(parsed);
    const template = document.createElement('template');
    template.innerHTML = html;
    const rejected: boolean[] = [];
    for (const html of ['<table><tr><td colspan="2">Merged</td></tr></table>', '<table><tr><td><table><tr><td>Nested</td></tr></table></td></tr></table>']) {
      const value = window.editor.schema.parseHTML(html);
      const before = JSON.stringify(value);
      try { serializeMarkdown(value); rejected.push(false); }
      catch (error) { rejected.push(error instanceof TypeError && JSON.stringify(value) === before); }
    }
    return { headings: [...template.content.querySelectorAll('th')].map((cell) => cell.textContent), values: [...template.content.querySelectorAll('td')].map((cell) => cell.textContent), roundTrip: window.editor.schema.documentHTML(parseMarkdown(serializeMarkdown(parsed))) === html, rejected };
  }, markdownTableSample);
  expect(result).toEqual({ headings: ['Item', 'Count'], values: ['Apples | red', '2', 'Pears', '3'], roundTrip: true, rejected: [true, true] });
});

test('codec refusals are atomic and explicit insertion uses selection/history while replacement clears history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const result = await page.evaluate(async () => {
    const path = '/packages/wysiwyg/dist/codecs/markdown.js';
    const { parseMarkdown, serializeMarkdown } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/codecs/markdown');
    const editor = window.editor;
    editor.setHTML('<p>Before keep</p><p>After</p>');
    editor.setSelection(7, 4);
    editor.insertHTML(editor.schema.documentHTML(parseMarkdown('**New**')));
    const inserted = editor.getHTML();
    editor.undo();
    const undo = { html: editor.getHTML(), selection: editor.getSelection(), redo: editor.canRedo() };
    const rejected: boolean[] = [];
    for (const action of [() => parseMarkdown('x'.repeat(1000001)), () => parseMarkdown('> '.repeat(34) + 'Nested'), () => parseMarkdown('- item\n'.repeat(4000)), () => serializeMarkdown({ version: 1, children: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text: '*'.repeat(500001) }] }] }), () => serializeMarkdown({ version: 1, children: [{ type: 'element', tag: 'span', attributes: { 'data-mw-node': 'unknown:mention' }, children: [] }] })]) {
      try { action(); rejected.push(false); } catch { rejected.push(true); }
    }
    const unchanged = editor.getHTML() === undo.html && editor.canRedo();
    editor.setJSON(parseMarkdown('# Replacement'));
    return { inserted, undo, rejected, unchanged, replaced: editor.getHTML(), history: editor.canUndo() || editor.canRedo() };
  });
  expect(result).toEqual({ inserted: '<p>Before <strong>New</strong></p><p>After</p>', undo: { html: '<p>Before keep</p><p>After</p>', selection: { index: 7, length: 4 }, redo: true }, rejected: [true, true, true, true, true], unchanged: true, replaced: '<h1>Replacement</h1>', history: false });
});

test('both public codecs execute without DOM or resource access in Node', ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'One DOM-free process check suffices for this shared artifact.');
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import { parseMarkdown, serializeMarkdown } from '@morfira-dev/wysiwyg/codecs/markdown';
    if (typeof document !== 'undefined' || typeof window !== 'undefined') throw new Error('Expected no DOM');
    globalThis.fetch = () => { throw new Error('Codec must not fetch'); };
    const value = parseMarkdown('# Server\\n\\n[Link](https://example.com)');
    const output = serializeMarkdown(value);
    if (!output.includes('# Server') || !output.includes('https://example.com')) throw new Error('Missing content');
    console.log('codec-dom-free');
  `], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  expect(output).toBe('codec-dom-free');
});
