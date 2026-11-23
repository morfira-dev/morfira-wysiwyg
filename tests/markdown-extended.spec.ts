import { expect, test } from '@playwright/test';

// Independently authored fixtures covering grammar described by the primary
// CommonMark 0.31.2 / GFM specifications; no external test corpus is vendored.
test('extended Markdown resolves forward references, setext headings, indented code and nested marks', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/packages/wysiwyg/dist/codecs/markdown.js';
    const { parseMarkdown, serializeMarkdown } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/codecs/markdown');
    const source = ['Morfira &copy;', '================', '', '[Guide][ docs ] [docs][] [docs] ![Logo][picture]', '', '[DOCS]: <https://example.com/a?x=1&amp;y=2> "A &quot;guide&quot;"', '[docs]: https://ignored.invalid', '[picture]: /mark.svg', '', '    [docs]: literal code', '    <script>&amp;</script>', '', '***combined*** **bold *nested*** *soft **strong*** foo_bar_baz a*middle*b', '', '<https://example.com/path> <reader@example.com>'].join('\n');
    const parsed = parseMarkdown(source);
    const template = document.createElement('template');
    template.innerHTML = window.editor.schema.documentHTML(parsed);
    const exported = serializeMarkdown(parsed);
    return {
      heading: template.content.querySelector('h1')?.textContent,
      links: [...template.content.querySelectorAll('a')].map((node) => node.getAttribute('href')),
      title: template.content.querySelector('a')?.getAttribute('title'),
      image: template.content.querySelector('img')?.getAttribute('src'),
      code: template.content.querySelector('pre')?.textContent?.trim(),
      nested: template.content.querySelector('strong em')?.textContent,
      intraword: template.content.textContent?.includes('foo_bar_baz'),
      adjacent: [...template.content.querySelectorAll('em')].some((node) => node.textContent === 'middle'),
      stable: JSON.stringify(parseMarkdown(exported)) === JSON.stringify(parsed),
    };
  });
  expect(result).toMatchObject({ heading: 'Morfira ©', title: 'A "guide"', image: '/mark.svg', code: '[docs]: literal code\n<script>&amp;</script>', nested: 'combined', intraword: true, adjacent: true, stable: true });
  expect(result.links).toEqual(['https://example.com/a?x=1&y=2', 'https://example.com/a?x=1&y=2', 'https://example.com/a?x=1&y=2', 'https://example.com/path', 'mailto:reader@example.com']);
});

test('tasks and column alignment are explicit independent codec options', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/packages/wysiwyg/dist/codecs/markdown.js';
    const { parseMarkdown, serializeMarkdown } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/codecs/markdown');
    const source = '- [x] Reviewed\n- [ ] Pending\n\n| Left | Middle | Right |\n| :--- | :---: | ---: |\n| A | B | C |';
    const options = { taskLists: true, tableAlignment: true };
    const value = parseMarkdown(source, options);
    const canonical = serializeMarkdown(value, options);
    const defaults = serializeMarkdown(parseMarkdown(source));
    const changed = structuredClone(value);
    const table = changed.children.find((node) => node.type === 'element' && node.tag === 'table');
    if (table?.type === 'element') {
      const row = table.children[1];
      if (row?.type === 'element') {
        const cell = row.children[0];
        if (cell?.type === 'element') cell.attributes.style = 'text-align: right';
      }
    }
    let mixed = false;
    try { serializeMarkdown(changed, options); } catch (error) { mixed = error instanceof TypeError; }
    return { canonical, defaults, stable: JSON.stringify(parseMarkdown(canonical, options)) === JSON.stringify(value), mixed };
  });
  expect(result.canonical).toContain('- [x] Reviewed\n- [ ] Pending');
  expect(result.canonical).toContain('| :--- | :---: | ---: |');
  expect(result.defaults).toContain('\\[x\\]');
  expect(result.defaults).toContain('| --- | --- | --- |');
  expect(result).toMatchObject({ stable: true, mixed: true });
});

test('entity decoding remains inert and encoded schemes cannot bypass Markdown URL policy', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/packages/wysiwyg/dist/codecs/markdown.js';
    const { parseMarkdown, serializeMarkdown } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/codecs/markdown');
    const value = parseMarkdown('&lt;script&gt; &NotInSubset; \\&amp; &#x1F680; &#0; `&amp;` [bad][unsafe] ![bad image](java&#115;cript:bad)\n\n[unsafe]: java&#115;cript:bad');
    const template = document.createElement('template');
    template.innerHTML = window.editor.schema.documentHTML(value);
    const roundTrip = parseMarkdown(serializeMarkdown(value));
    const failures: boolean[] = [];
    for (const input of [{ taskLists: 'yes' }, { html: true }, null]) {
      try { parseMarkdown('safe', input as never); failures.push(false); } catch (error) { failures.push(error instanceof TypeError); }
    }
    return { text: template.content.textContent, tags: template.content.querySelectorAll('script,a,img').length, stable: JSON.stringify(roundTrip) === JSON.stringify(value), failures };
  });
  expect(result.text).toContain('<script> &NotInSubset; &amp; 🚀 � &amp; bad bad image');
  expect(result).toMatchObject({ tags: 0, stable: true, failures: [true, true, true] });
});
