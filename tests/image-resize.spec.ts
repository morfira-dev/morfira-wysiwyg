import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './image-resize.types.js';

const figure = '<figure><img src="/logo.svg" alt="Original" title="Keep" width="120" height="80"><figcaption><strong>Caption</strong> tail</figcaption></figure><p>After</p>';
const initialize = async (page: Page, html = figure) => {
  await page.goto('/');
  await expect(page.locator('.mw-content')).toBeVisible();
  await page.evaluate((value) => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'resize-image-editor';
    document.body.replaceChildren(host);
    window.changes = [];
    window.editor = window.createEditor(host, {
      value, plugins: [window.createImages()],
      onChange: (change) => window.changes.push(change),
    });
    window.resizeImageAPI = window.imageCommands(window.editor);
    const image = window.editor.surface.querySelector('img');
    if (image) window.resizeImageAPI.select(image);
  }, html);
};
const image = (page: Page) => page.locator('.resize-image-editor .mw-content img').first();

test('proportional width and height retain actual image/caption nodes, native selection and one-step history', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const img = root.querySelector('img')!;
    const figureNode = img.parentElement!;
    const caption = figureNode.querySelector('figcaption')!;
    const strong = caption.querySelector('strong')!;
    window.resizeImageAPI.resize({ width: 90 });
    const selection = document.getSelection()!;
    const range = selection.getRangeAt(0);
    return {
      width: img.getAttribute('width'), height: img.getAttribute('height'),
      node: root.querySelector('img') === img && img.parentElement === figureNode,
      caption: figureNode.querySelector('figcaption') === caption && caption.querySelector('strong') === strong,
      selected: range.startContainer === figureNode && range.startOffset === 0 && range.endContainer === figureNode && range.endOffset === 1,
      changes: window.changes.length,
    };
  })).toEqual({ width: '90', height: '60', node: true, caption: true, selected: true, changes: 1 });
  await expect(image(page)).toHaveAttribute('title', 'Keep');
  await expect(image(page)).toHaveCSS('width', '90px');
  await expect(image(page)).toHaveCSS('height', '60px');
  await page.evaluate(() => window.resizeImageAPI.resize({ width: 90 }));
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect(image(page)).toHaveAttribute('height', '60');
  await page.evaluate(() => window.resizeImageAPI.resize({ height: 41 }));
  await expect(image(page)).toHaveAttribute('width', '62');
  await expect(image(page)).toHaveAttribute('height', '41');
  await page.evaluate(() => window.editor.setJSON(window.editor.getJSON()));
  await expect(image(page)).toHaveAttribute('width', '62');
  const serialized = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate((html) => window.editor.setHTML(html), serialized);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(serialized);
  await expect(page.locator('.resize-image-editor figcaption strong')).toHaveText('Caption');
});

test('resize uses already loaded natural dimensions without additional requests and prefers stored dimensions', async ({ page }) => {
  let requests = 0;
  await page.route('**/resize-natural.svg', async (route) => {
    requests++;
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"></svg>' });
  });
  await initialize(page, '<p>Before<img src="/resize-natural.svg" alt="Natural">After</p>');
  await expect.poll(() => image(page).evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(320);
  const fetched = requests;
  await page.evaluate(() => window.resizeImageAPI.resize({ height: 75 }));
  await expect(image(page)).toHaveAttribute('width', '150');
  await expect(image(page)).toHaveAttribute('height', '75');
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(requests).toBe(fetched);
  await page.evaluate(() => {
    window.editor.setHTML('<p>Before<img src="/resize-natural.svg" width="120" height="80">After</p>');
    window.resizeImageAPI.select(window.editor.surface.querySelector('img')!);
    window.resizeImageAPI.resize({ width: 90 });
  });
  await expect(image(page)).toHaveAttribute('height', '60');
  await expect(page.locator('.resize-image-editor p')).toHaveText('BeforeAfter');
});

test('unknown proportions, malformed dimensions and derived overflow reject before document/history changes', async ({ page }) => {
  await page.route('**/resize-unavailable.png', (route) => route.abort());
  await initialize(page, '<p><img src="/resize-unavailable.png">After</p>');
  expect(await page.evaluate(() => {
    try { window.resizeImageAPI.resize({ width: 50 }); return false; }
    catch { return true; }
  })).toBe(true);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate((html) => {
    window.editor.setHTML(html);
    window.resizeImageAPI.select(window.editor.surface.querySelector('img')!);
  }, figure);
  expect(await page.evaluate(() => {
    const before = window.editor.getHTML();
    const invalid: unknown[] = [null, [], {}, { width: 20, height: 10 }, { width: undefined }, { width: '20' },
      { width: 0 }, { height: -1 }, { width: 1.5 }, { height: Number.NaN }, { width: Infinity }, { width: 1001 },
      { width: 20, extra: true }, Object.create({ width: 20 }), { width: 20, [Symbol('unknown')]: true },
      Object.defineProperty({ width: 20 }, 'height', { value: 10 })];
    return invalid.every((size) => {
      let rejected = false;
      try { window.resizeImageAPI.resize(size as import('@morfira-dev/wysiwyg/plugins/images').ImageResize); }
      catch { rejected = true; }
      return rejected && window.editor.getHTML() === before && !window.editor.canUndo();
    });
  })).toBe(true);
  await page.evaluate(() => {
    window.editor.setHTML('<p><img src="/logo.svg" width="1000" height="1"></p>');
    window.resizeImageAPI.select(window.editor.surface.querySelector('img')!);
  });
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => [{ height: 2 }, { width: 1 }].every((size) => {
    try { window.resizeImageAPI.resize(size); return false; }
    catch { return true; }
  }))).toBe(true);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
});

test('a resize inside a merged table cell preserves grid, lists and unrelated image content', async ({ page }) => {
  const html = '<ul><li><p>List<img src="/logo.svg" width="40" height="20"></p></li></ul>'
    + '<table><tbody><tr><td rowspan="2"><figure><img src="/logo.svg" width="120" height="80"><figcaption>Cell</figcaption></figure></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><p>Tail</p>';
  await initialize(page, html);
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const table = root.querySelector('table')!;
    const cell = table.querySelector('td')!;
    const list = root.querySelector('ul')!;
    const listImage = list.querySelector('img')!;
    const img = cell.querySelector('img')!;
    window.resizeImageAPI.select(img);
    window.resizeImageAPI.resize({ width: 60 });
    return { cell: table.querySelector('td') === cell, table: root.querySelector('table') === table,
      list: root.querySelector('ul') === list && list.querySelector('img') === listImage,
      listWidth: listImage.getAttribute('width'), width: img.getAttribute('width'), height: img.getAttribute('height'),
      rowspan: cell.getAttribute('rowspan'), cells: table.querySelectorAll('td').length };
  })).toEqual({ cell: true, table: true, list: true, listWidth: '40', width: '60', height: '40', rowspan: '2', cells: 3 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => {
    window.resizeImageAPI.select(window.editor.surface.querySelector('li img')!);
    window.resizeImageAPI.resize({ height: 15 });
  });
  await expect(page.locator('.resize-image-editor li img')).toHaveAttribute('width', '30');
});

test('read-only and composition are inert and disposing one editor leaves another resize API usable', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.resizeImageAPI.resize({ width: 60 });
    window.editor.setReadOnly(false);
    window.resizeImageAPI.select(window.editor.surface.querySelector('img')!);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.resizeImageAPI.resize({ height: 40 });
  });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length })))
    .toEqual({ html: before, undo: false, changes: 0 });
  expect(await page.evaluate(() => {
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const host = document.createElement('div');
    document.body.append(host);
    const other = window.createEditor(host, { plugins: [window.createImages()], value: '<p><img src="/logo.svg" width="80" height="40"></p>' });
    const api = window.imageCommands(other);
    api.select(other.surface.querySelector('img')!);
    window.editor.destroy();
    let rejected = false;
    try { window.resizeImageAPI.resize({ width: 60 }); }
    catch { rejected = true; }
    api.resize({ height: 10 });
    const img = other.surface.querySelector('img')!;
    const result = { rejected, width: img.getAttribute('width'), height: img.getAttribute('height') };
    other.destroy();
    return result;
  })).toEqual({ rejected: true, width: '20', height: '10' });
});

test('focus-time external replacement cannot redirect a resize to a new image', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const old = window.editor.surface.querySelector('img')!;
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    const range = document.createRange();
    range.selectNode(old);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    let expected = '';
    window.editor.surface.blur();
    window.editor.surface.addEventListener('focusin', () => {
      window.editor.setHTML('<figure><img src="/logo.svg?external" width="200" height="100"><figcaption>External</figcaption></figure><p>Tail</p>');
      expected = window.editor.getHTML();
    }, { once: true });
    let rejected = false;
    try { window.resizeImageAPI.resize({ width: 60 }); }
    catch { rejected = true; }
    const current = window.editor.surface.querySelector('img')!;
    return { rejected, unchanged: Boolean(expected) && window.editor.getHTML() === expected,
      replaced: current !== old, width: current.getAttribute('width'), undo: window.editor.canUndo() };
  })).toEqual({ rejected: true, unchanged: true, replaced: true, width: '200', undo: false });
});

test('protected, foreign and complex image owners reject without changing content or history', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate((html) => {
    const results: boolean[] = [];
    for (const kind of ['ancestor', 'caption', 'complex', 'foreign'] as const) {
      window.editor.setHTML(html);
      const root = window.editor.surface;
      const img = root.querySelector('img')!;
      const owner = img.parentElement!;
      if (kind === 'ancestor') owner.setAttribute('data-mw-node', 'protected');
      if (kind === 'caption') owner.querySelector('strong')!.setAttribute('data-mw-node', 'protected');
      if (kind === 'complex') owner.append(document.createElement('hr'));
      if (kind === 'foreign') owner.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      window.resizeImageAPI.select(img);
      const before = root.innerHTML;
      let rejected = false;
      try { window.resizeImageAPI.resize({ width: 60 }); }
      catch { rejected = true; }
      results.push(rejected && root.innerHTML === before && !window.editor.canUndo());
    }
    return results;
  }, figure)).toEqual([true, true, true, true]);
});

test('caption-caret resizing restores the original rich-text caret with Undo', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const text = root.querySelector('figcaption strong')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const before = window.editor.getHTML();
    window.resizeImageAPI.resize({ width: 60 });
    const resized = root.querySelector('img')!.getAttribute('height') === '40';
    window.editor.undo();
    const anchor = document.getSelection()!.anchorNode;
    return { resized, restored: window.editor.getHTML() === before, offset: document.getSelection()!.anchorOffset,
      text: anchor?.textContent, caption: Boolean(anchor?.parentElement?.closest('figcaption')), undo: window.editor.canUndo() };
  })).toEqual({ resized: true, restored: true, offset: 3, text: 'Caption', caption: true, undo: false });
});
