import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './image-alignment.types.js';

const original = '<figure><img src="/logo.svg" alt="Original" title="Keep" width="120" height="80"><figcaption><strong>Rich</strong> caption</figcaption></figure><p>Tail</p>';
const initialize = async (page: Page, value = original, install = true) => {
  await page.goto('/');
  await expect(page.locator('.mw-content')).toBeVisible();
  await page.evaluate(({ value, install }) => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'image-alignment-editor';
    host.style.width = '600px';
    document.body.replaceChildren(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, plugins: install ? [window.createImages()] : [], onChange: (change) => window.changes.push(change) });
    if (install) {
      window.alignmentImageAPI = window.imageCommands(window.editor);
      window.alignmentImageAPI.select(window.editor.surface.querySelector('img')!);
    }
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, { value, install });
};
const image = (page: Page) => page.locator('.image-alignment-editor img').first();

test('physical placements retain rich caption and image identity, use one Undo and skip identical requests', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  const nodes = await image(page).evaluateHandle((img) => ({ img, figure: img.parentElement!, strong: img.parentElement!.querySelector('strong')! }));
  for (const alignment of ['left', 'center', 'right'] as const) {
    await page.evaluate((value) => window.alignmentImageAPI.align(value), alignment);
    expect(await page.evaluate(() => window.alignmentImageAPI.getSelected()?.alignment)).toBe(alignment);
    expect(await nodes.evaluate(({ img, figure, strong }) => {
      const range = document.getSelection()!.getRangeAt(0);
      return img === window.editor.surface.querySelector('img') && img.parentElement === figure
        && strong === figure.querySelector('strong') && range.startContainer === img.parentNode
        && range.startOffset + 1 === range.endOffset && range.startContainer.childNodes[range.startOffset] === img;
    })).toBe(true);
    const placement = await image(page).evaluate((img) => {
      const rectangle = img.getBoundingClientRect();
      const owner = img.parentElement!.getBoundingClientRect();
      return { left: rectangle.left - owner.left, right: owner.right - rectangle.right };
    });
    if (alignment === 'left') expect(Math.abs(placement.left)).toBeLessThan(1);
    else if (alignment === 'right') expect(Math.abs(placement.right)).toBeLessThan(1);
    else expect(Math.abs(placement.left - placement.right)).toBeLessThan(1);
  }
  expect(await page.evaluate(() => window.changes.length)).toBe(3);
  await page.evaluate(() => window.alignmentImageAPI.align('right'));
  expect(await page.evaluate(() => window.changes.length)).toBe(3);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.alignmentImageAPI.getSelected()?.alignment)).toBe('center');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.alignmentImageAPI.getSelected()?.alignment)).toBe('left');
});

test('insert/update preserve placement independently of other metadata and reset only placement styles', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    window.alignmentImageAPI.update({ alignment: 'center' });
    window.alignmentImageAPI.update({ alt: 'Changed' });
  });
  expect(await page.evaluate(() => window.alignmentImageAPI.getSelected()?.alignment)).toBe('center');
  await expect(image(page)).toHaveAttribute('alt', 'Changed');
  await page.evaluate(() => window.alignmentImageAPI.align(false));
  expect(await image(page).evaluate((img) => ({ display: img.style.display, left: img.style.marginLeft, right: img.style.marginRight, width: img.style.width, height: img.style.height })))
    .toEqual({ display: '', left: '', right: '', width: '120px', height: '80px' });
  expect(await page.evaluate(() => window.alignmentImageAPI.getSelected()?.alignment)).toBeUndefined();
  const changes = await page.evaluate(() => window.changes.length);
  await page.evaluate(() => window.alignmentImageAPI.align(false));
  expect(await page.evaluate(() => window.changes.length)).toBe(changes);
  await page.evaluate(() => {
    window.editor.setHTML('<p>Start</p>');
    window.editor.setSelection(5);
    window.alignmentImageAPI.insert({ src: '/logo.svg?inserted', alignment: 'right', width: 90, caption: 'Inserted' });
    window.alignmentImageAPI.select(window.editor.surface.querySelector('img')!);
  });
  expect(await page.evaluate(() => window.alignmentImageAPI.getSelected()?.alignment)).toBe('right');
  await expect(page.locator('.image-alignment-editor figcaption')).toHaveText('Inserted');
});

test('plugin-free HTML and JSON roundtrips retain bounded placement and reject unsafe CSS', async ({ page }) => {
  const value = '<figure><img src="/logo.svg" width="120" style="display:block;margin-left:auto;margin-right:0px;float:right;position:fixed;transform:rotate(1deg);margin-top:999px"><figcaption style="display:block;margin-left:auto">Caption</figcaption></figure><p>Tail</p>';
  await initialize(page, value, false);
  const sanitized = await page.evaluate(() => window.editor.getHTML());
  expect(await image(page).evaluate((img) => ({ display: img.style.display, left: img.style.marginLeft, right: img.style.marginRight, float: img.style.cssFloat, position: img.style.position, transform: img.style.transform, top: img.style.marginTop })))
    .toEqual({ display: 'block', left: 'auto', right: '0px', float: '', position: '', transform: '', top: '' });
  expect(await page.locator('.image-alignment-editor figcaption').getAttribute('style')).toBeNull();
  await page.evaluate(() => window.editor.setJSON(window.editor.getJSON()));
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(sanitized);
  await page.evaluate((html) => window.editor.setHTML(html), sanitized);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(sanitized);
  expect(await page.evaluate(() => {
    window.editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'element', tag: 'img', attributes: { src: '/logo.svg', style: 'display:flex;margin-left:1px;margin-right:inherit;margin:auto;display:url(javascript:alert(1))' }, children: [] }] }] });
    const img = window.editor.surface.querySelector('img')!;
    return { display: img.style.display, left: img.style.marginLeft, right: img.style.marginRight, margin: img.style.margin };
  })).toEqual({ display: '', left: '', right: '', margin: '' });
});

test('inline/list and merged-cell placement preserves surrounding nodes and stays physical under RTL', async ({ page }) => {
  await initialize(page, '<ul><li><p>Before<img src="/logo.svg" width="80" height="40">After</p></li></ul><table><tbody><tr><td dir="rtl" rowspan="2"><figure><img src="/logo.svg" width="120" height="80"><figcaption>Cell</figcaption></figure></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><p>Tail</p>');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const paragraph = root.querySelector('li p')!;
    const inline = paragraph.querySelector('img')!;
    window.alignmentImageAPI.align('center');
    const table = root.querySelector('table')!;
    const cell = table.querySelector('td')!;
    const img = cell.querySelector('img')!;
    window.alignmentImageAPI.select(img);
    window.alignmentImageAPI.align('right');
    return { inline: paragraph.querySelector('img') === inline, parent: inline.parentNode === paragraph, text: paragraph.textContent, blocks: paragraph.querySelectorAll('figure').length,
      table: root.querySelector('table') === table, cell: table.querySelector('td') === cell, cells: table.querySelectorAll('td').length, rowspan: cell.getAttribute('rowspan'),
      direction: cell.getAttribute('dir'), margins: [img.style.marginLeft, img.style.marginRight] };
  })).toEqual({ inline: true, parent: true, text: 'BeforeAfter', blocks: 0, table: true, cell: true, cells: 3, rowspan: '2', direction: 'rtl', margins: ['auto', '0px'] });
});

test('invalid values and protected/complex owners reject alignment atomically', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const before = window.editor.getHTML();
    return [undefined, null, true, '', 'justify', 'start', 'left;position:fixed', {}, ['left']].every((value) => {
      let rejected = false;
      try { window.alignmentImageAPI.align(value as import('@morfira-dev/wysiwyg/plugins/images').ImageAlignment); }
      catch { rejected = true; }
      return rejected && window.editor.getHTML() === before && !window.editor.canUndo();
    });
  })).toBe(true);
  expect(await page.evaluate((html) => {
    return ['semantic', 'caption', 'complex'].every((kind) => {
      window.editor.setHTML(html);
      const img = window.editor.surface.querySelector('img')!;
      const figure = img.parentElement!;
      if (kind === 'semantic') figure.setAttribute('data-mw-node', 'app:owned');
      if (kind === 'caption') figure.querySelector('strong')!.setAttribute('data-mw-node', 'app:owned');
      if (kind === 'complex') figure.append(document.createElement('hr'));
      window.alignmentImageAPI.select(img);
      const before = window.editor.surface.innerHTML;
      let rejected = false;
      try { window.alignmentImageAPI.update({ alignment: 'left' }); }
      catch { rejected = true; }
      return rejected && window.editor.surface.innerHTML === before && !window.editor.canUndo();
    });
  }, original)).toBe(true);
});

test('read-only/IME prevent alignment and focus replacement cannot receive an old command', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.alignmentImageAPI.align('left');
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.alignmentImageAPI.align('center');
    window.alignmentImageAPI.update({ alignment: 'right' });
  });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  expect(await page.evaluate(() => {
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const old = window.editor.surface.querySelector('img')!;
    window.alignmentImageAPI.select(old);
    const surface = window.editor.surface;
    const focus = surface.focus.bind(surface);
    let expected = '';
    let called = false;
    // WebKit blur clears the image selection; inject the race at focus instead.
    surface.focus = (options) => {
      surface.focus = focus;
      focus(options);
      called = true;
      window.editor.setHTML('<p><img src="/logo.svg?external" width="200" height="100">External</p>');
      expected = window.editor.getHTML();
    };
    let rejected = false;
    try { window.alignmentImageAPI.align('right'); }
    catch { rejected = true; }
    finally { surface.focus = focus; }
    return { called, rejected, replaced: surface.querySelector('img') !== old, unchanged: Boolean(expected) && expected === window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ called: true, rejected: true, replaced: true, unchanged: true, undo: false });
});
