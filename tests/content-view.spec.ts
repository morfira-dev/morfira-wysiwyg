import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/playground/content-view.html');
  await expect.poll(() => page.evaluate(() => typeof window.createContentView)).toBe('function');
});

test('saved semantic JSON displays independently with inert resources and canonical copied data', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const result = await page.evaluate(() => {
    const schema = [{ name: 'app:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } }] as const;
    const codec = window.createDocumentSchema(schema);
    const saved = codec.parseHTML('<h2>Article</h2><p><span data-mw-node="app:reference" data-id="42">Ada</span> <a href="https://example.com/read">Read</a></p><table><tr><th scope="col" colspan="2">Header</th></tr><tr><td>A</td><td>B</td></tr></table><figure><img src="https://content.example/image.png" alt="Saved photo"><figcaption>Caption</figcaption></figure>');
    const view = window.createContentView(document.querySelector<HTMLElement>('#content-host')!, { value: JSON.parse(JSON.stringify(saved)), schema });
    const first = view.getJSON();
    first.children.length = 0;
    const html = view.getHTML();
    const output = { html, independent: view.getJSON().children.length > 0, equal: JSON.stringify(view.getJSON()) === JSON.stringify(saved), text: view.element.textContent, editors: document.querySelectorAll('.mw-editor,[contenteditable]').length };
    return output;
  });
  expect(result).toMatchObject({ independent: true, equal: true, editors: 0 });
  expect(result.html).toContain('src="https://content.example/image.png"');
  expect(result.html).toContain('href="https://example.com/read"');
  await expect(page.locator('.mw-content-view img')).toHaveCount(0);
  await expect(page.locator('.mw-content-view a')).not.toHaveAttribute('href');
  await expect(page.locator('.mw-content-view a')).not.toHaveAttribute('tabindex');
  await expect(page.locator('.mw-content-view a')).toHaveCSS('text-decoration-line', 'none');
  await expect(page.locator('.mw-content-view [data-id="42"]')).toHaveText('Ada');
  await expect(page.locator('.mw-content-view th')).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content-view-image')).toHaveText('Saved photo');
  expect(requests.filter((url) => url.startsWith('https://content.example/'))).toEqual([]);
});

test('invalid replacement retains actual nodes and canonical data while normalized HTML is inert', async ({ page }) => {
  const result = await page.evaluate(() => {
    const view = window.createContentView(document.querySelector<HTMLElement>('#content-host')!, { value: '<p>Retained</p>' });
    const before = view.element.firstChild;
    const html = view.getHTML();
    let invalid = false;
    try { view.setJSON({ version: 1, children: [{ type: 'element', tag: 'p', attributes: { dir: 'auto' }, children: [] }] }); }
    catch { invalid = true; }
    const kept = before === view.element.firstChild && html === view.getHTML();
    view.setHTML('<p onclick="alert(1)">New<script>alert(2)</script><a href="javascript:alert(3)">Link</a><img src="https://content.example/x.png" onerror="alert(4)"></p>');
    return { invalid, kept, html: view.getHTML(), text: view.element.textContent, active: view.element.querySelectorAll('script,[onclick],[onerror],a[href],img').length };
  });
  expect(result.invalid).toBe(true);
  expect(result.kept).toBe(true);
  expect(result.active).toBe(0);
  expect(result.text).toContain('New');
  expect(result.html).not.toMatch(/script|onclick|onerror|javascript:/);
});

test('explicit image and navigation policies are bounded and never activate an unsafe resolved base', async ({ page }) => {
  await page.route('https://content.example/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" />' }));
  const requested = page.waitForRequest('https://content.example/allowed.svg');
  const result = await page.evaluate(() => {
    const view = window.createContentView(document.querySelector<HTMLElement>('#content-host')!, {
      images: 'load', links: 'navigate', value: '<p><a href="https://example.com/article">Article</a><a href="mailto:team@example.com">Mail</a><img src="https://content.example/allowed.svg" alt="Allowed"></p>',
    });
    const links = [...view.element.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel }));
    return { links };
  });
  await requested;
  const refused = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('#content-host')!;
    host.replaceChildren();
    const view = window.createContentView(host, { links: 'navigate', images: 'load' });
    view.setHTML('<p><a href="relative">Stable destination</a><img src="/stable-image.svg" alt="Stable image"></p>');
    const stableImage = view.element.querySelector('img')!.getAttribute('src');
    const stable = view.element.querySelector('a')!.href;
    const canonical = view.getHTML();
    const base = document.createElement('base');
    base.href = 'file:///private/article/';
    document.head.append(base);
    const retainedSafe = view.element.querySelector('a')!.href === stable && stable.startsWith('http:') && canonical.includes('href="relative"')
      && stableImage!.startsWith('http:') && view.element.querySelector('img')!.getAttribute('src') === stableImage
      && canonical.includes('src="/stable-image.svg"');
    view.setHTML('<p><a href="relative">No file navigation</a><img src="relative-image.svg" alt="No file request"></p>');
    const refused = !view.element.querySelector('a')!.hasAttribute('href')
      && !view.element.querySelector('img') && view.element.textContent!.includes('No file request');
    base.remove();
    return refused && retainedSafe;
  });
  expect(result.links).toEqual([
    { href: 'https://example.com/article', target: '_blank', rel: 'noopener noreferrer' },
    { href: 'mailto:team@example.com', target: '_blank', rel: 'noopener noreferrer' },
  ]);
  expect(refused).toBe(true);
});

test('unregistered JSON owners reject while HTML fallback keeps safe text', async ({ page }) => {
  const result = await page.evaluate(() => {
    const codec = window.createDocumentSchema([{ name: 'app:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } }]);
    const saved = codec.parseHTML('<p><span data-mw-node="app:reference" data-id="7">Reference</span></p>');
    const host = document.querySelector<HTMLElement>('#content-host')!;
    let rejected = false;
    try { window.createContentView(host, { value: saved }); }
    catch { rejected = true; }
    const empty = !host.hasChildNodes();
    let nullRejected = false;
    try { window.createContentView(host, { value: null as unknown as import('@morfira-dev/wysiwyg').EditorDocument }); }
    catch { nullRejected = true; }
    const view = window.createContentView(host, { value: '<p><span data-mw-node="app:reference" data-id="7">Reference</span></p>' });
    return { rejected, empty, nullRejected, text: view.element.textContent, html: view.getHTML() };
  });
  expect(result).toMatchObject({ rejected: true, empty: true, nullRejected: true, text: 'Reference' });
  expect(result.html).not.toContain('data-mw-node');
  expect(result.html).not.toContain('data-id');
});

test('ownership guards, two instances and idempotent disposal preserve foreign siblings', async ({ page }) => {
  const result = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('#content-host')!;
    const otherHost = document.createElement('div');
    document.body.append(otherHost);
    const one = window.createContentView(host, { value: '<p>One</p>' });
    const two = window.createContentView(otherHost, { value: '<p>Two</p>' });
    let duplicate = false;
    try { window.createContentView(host); } catch { duplicate = true; }
    const foreign = document.createElement('p'); foreign.textContent = 'Foreign'; host.append(foreign);
    const keeper = document.createElement('aside'); document.body.append(keeper); keeper.append(one.element);
    let stale = false;
    try { one.setHTML('<p>Redirected</p>'); } catch { stale = true; }
    one.destroy(); one.destroy();
    let disposed = false;
    try { one.getJSON(); } catch { disposed = true; }
    const independent = two.getHTML();
    keeper.append(otherHost);
    let movedHost = false;
    try { two.getJSON(); } catch { movedHost = true; }
    two.destroy();
    return { duplicate, stale, disposed, movedHost, foreign: host.textContent, removed: !one.element.isConnected, other: independent };
  });
  expect(result).toEqual({ duplicate: true, stale: true, disposed: true, movedHost: true, foreign: 'Foreign', removed: true, other: '<p>Two</p>' });
});


test('wide saved tables scroll inside the article and heading styles do not inherit documentation chrome', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const result = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('#content-host')!;
    const columnsHTML = '<col width="80">'.repeat(24);
    const cellsHTML = '<td style="padding: 12px">A</td>'.repeat(24);
    // Preferred widths may shrink; 24 cells' own padding creates a real minimum
    // wider than this host in every engine, without forcing implementation CSS.
    const view = window.createContentView(host, { value: `<h2>Heading</h2><table><colgroup>${columnsHTML}</colgroup><tr><th colspan="24">Wide merged header</th></tr><tr>${cellsHTML}</tr></table>` });
    const columns = [...view.element.querySelectorAll('col')].map((column) => column.getAttribute('width'));
    const tableWider = view.element.querySelector('table')!.getBoundingClientRect().width > view.element.clientWidth;
    const canonicalColumns = view.getJSON().children.filter((node) => node.type === 'element' && node.tag === 'table')[0];
    return { pageFits: document.documentElement.scrollWidth <= window.innerWidth + 1, articleFits: view.element.getBoundingClientRect().width <= window.innerWidth, innerScroll: view.element.scrollWidth > view.element.clientWidth, tableWider, columns, canonicalWidths: JSON.stringify(canonicalColumns).match(/"width":"80"/g)?.length };
  });
  expect(result).toEqual({ pageFits: true, articleFits: true, innerScroll: true, tableWider: true, columns: Array(24).fill('80'), canonicalWidths: 24 });
  await expect(page.locator('.mw-content-view h2')).toHaveCSS('border-top-width', '0px');
});
