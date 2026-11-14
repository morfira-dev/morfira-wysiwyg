import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, html: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.editor.setSelection(0);
    window.changes = [];
  }, html);
};

for (const [format, tag] of [
  ['bold', 'strong'], ['italic', 'em'], ['underline', 'u'], ['strike', 's'],
  ['code', 'code'], ['subscript', 'sub'], ['superscript', 'sup'],
]) test(`${format} in one heading preserves adjacent blocks and has one-step content/selection history`, async ({ page }) => {
  await initialize(page, '<p>Unchanged</p><h2>abcd</h2><p>Tail</p>');
  const result = await page.evaluate(({ format, tag }) => {
    const editor = window.editor;
    const first = editor.surface.firstElementChild!;
    const last = editor.surface.lastElementChild!;
    const before = editor.getHTML();
    editor.setSelection(10, 2);
    editor.format(format, true);
    const marked = editor.getHTML();
    const selected = editor.getSelection();
    const target = editor.surface.querySelector(`h2 ${tag}`)?.textContent;
    const changes = window.changes.length;
    editor.format(format, false);
    const removed = editor.getHTML();
    const retained = first === editor.surface.firstElementChild && last === editor.surface.lastElementChild;
    editor.undo();
    const undoRemoval = editor.getHTML();
    editor.undo();
    const undoFormat = editor.getHTML();
    const undoSelection = editor.getSelection();
    editor.redo();
    return { before, marked, target, selected, changes, removed, retained, undoRemoval, undoFormat, undoSelection, redo: editor.getHTML() };
  }, { format, tag });
  expect(result.target).toBe('bc');
  expect(result.selected).toEqual({ index: 10, length: 2 });
  expect(result.changes).toBe(1);
  expect(result.removed).toBe(result.before);
  expect(result.retained).toBe(true);
  expect(result.undoRemoval).toBe(result.marked);
  expect(result.undoFormat).toBe(result.before);
  expect(result.undoSelection).toEqual({ index: 10, length: 2 });
  expect(result.redo).toBe(result.marked);
});

test('paragraph formatting retains unrelated image and DOM-owned listeners', async ({ page }) => {
  await initialize(page, '<p>Before</p><p>Hello <em>world</em>!</p><figure><img src="/logo.svg" alt="Logo"><figcaption>Caption</figcaption></figure><p>After</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const before = editor.surface.firstElementChild!;
    const image = editor.surface.querySelector('img')!;
    const figure = editor.surface.querySelector('figure')!;
    const after = editor.surface.lastElementChild!;
    let delivered = 0;
    before.addEventListener('locality-probe', () => { delivered++; });
    image.addEventListener('locality-probe', () => { delivered++; });
    editor.setSelection(12, 5);
    editor.format('bold', true);
    editor.surface.firstElementChild!.dispatchEvent(new Event('locality-probe'));
    editor.surface.querySelector('img')!.dispatchEvent(new Event('locality-probe'));
    return {
      first: before === editor.surface.firstElementChild,
      image: image === editor.surface.querySelector('img'),
      figure: figure === editor.surface.querySelector('figure'),
      last: after === editor.surface.lastElementChild,
      delivered, selection: editor.getSelection(), focus: document.activeElement === editor.surface,
    };
  });
  expect(result).toEqual({ first: true, image: true, figure: true, last: true, delivered: 2, selection: { index: 12, length: 5 }, focus: true });
  await expect(page.locator('.mw-content p em strong')).toHaveText('world');
});

test('partial mark removal retains links, inline colors, nested emphasis and sibling identity', async ({ page }) => {
  await initialize(page, '<p><a href="/safe"><span style="color: red"><strong>a<em>bc</em>d</strong></span></a></p><p>Tail</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const tail = editor.surface.lastElementChild;
    editor.setSelection(1, 2);
    editor.format('bold', false);
    return { retained: tail === editor.surface.lastElementChild, selection: editor.getSelection(), hrefs: [...editor.surface.querySelectorAll('a')].map((node) => node.getAttribute('href')), colors: [...editor.surface.querySelectorAll('span')].map((node) => node.style.color) };
  });
  expect(result.retained).toBe(true);
  expect(result.selection).toEqual({ index: 1, length: 2 });
  expect(result.hrefs.length).toBeGreaterThan(0);
  expect(result.colors.length).toBeGreaterThan(0);
  expect(result.hrefs.every((href) => href === '/safe')).toBe(true);
  expect(result.colors.every((color) => color === 'red')).toBe(true);
  await expect(page.locator('.mw-content strong')).toHaveText(['a', 'd']);
  await expect(page.locator('.mw-content em')).toHaveText('bc');
  await expect(page.locator('.mw-content')).toHaveText('abcdTail');
});

test('backward Unicode selection survives formatting, replacement input and undo/redo', async ({ page }) => {
  await initialize(page, '<p>Before</p><p>😀ab<em>cd</em>ef</p><p>After</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const native = window.getSelection()!;
    editor.setSelection(9, 2);
    const initial = native.getRangeAt(0);
    native.setBaseAndExtent(initial.endContainer, initial.endOffset, initial.startContainer, initial.startOffset);
    editor.format('bold', true);
    const selected = native.getRangeAt(0);
    return { text: native.toString(), backward: native.anchorNode === selected.endContainer && native.anchorOffset === selected.endOffset, selection: editor.getSelection(), focus: document.activeElement === editor.surface };
  });
  expect(result).toEqual({ text: 'bc', backward: true, selection: { index: 9, length: 2 }, focus: true });
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content')).toHaveText('Before😀aXdefAfter');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 10, length: 0 });
  for (const action of ['undo', 'undo', 'redo'] as const) {
    const restored = await page.evaluate((action) => {
      window.editor[action]();
      const native = window.getSelection()!;
      const selected = native.getRangeAt(0);
      return { text: native.toString(), backward: native.anchorNode === selected.endContainer && native.anchorOffset === selected.endOffset, selection: window.editor.getSelection() };
    }, action);
    expect(restored).toEqual({ text: 'bc', backward: true, selection: { index: 9, length: 2 } });
  }
});

test('leaf formatting inside a nested list in a merged cell retains grid and neighboring nodes', async ({ page }) => {
  await initialize(page, '<p>Before</p><table><tbody><tr><td rowspan="2"><ul><li><p>abcd</p><ol><li>Nested</li></ol></li><li>Sibling</li></ul></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><p>After</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const before = editor.getHTML();
    const table = editor.surface.querySelector('table');
    const cells = [...editor.surface.querySelectorAll('td')];
    const list = editor.surface.querySelector('ul');
    const nested = editor.surface.querySelector('ol');
    editor.setSelection(7, 2);
    editor.format('underline', true);
    const retained = table === editor.surface.querySelector('table') && list === editor.surface.querySelector('ul') && nested === editor.surface.querySelector('ol') && cells.every((cell, index) => cell === editor.surface.querySelectorAll('td')[index]);
    const rowSpan = cells[0].getAttribute('rowspan');
    const selection = editor.getSelection();
    const marked = editor.getHTML();
    editor.undo();
    const undone = editor.getHTML();
    editor.redo();
    return { before, retained, rowSpan, selection, marked, undone, redone: editor.getHTML() };
  });
  expect(result.retained).toBe(true);
  expect(result.rowSpan).toBe('2');
  expect(result.selection).toEqual({ index: 7, length: 2 });
  expect(result.undone).toBe(result.before);
  expect(result.redone).toBe(result.marked);
  await expect(page.locator('.mw-content td[rowspan="2"] p u')).toHaveText('bc');
  await expect(page.locator('.mw-content td')).toHaveCount(3);
});

test('selected-block attributes are sanitized while unrelated nodes stay connected', async ({ page }) => {
  await initialize(page, '<p>abcd</p><p>Tail</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const block = editor.surface.firstElementChild!;
    const tail = editor.surface.lastElementChild;
    block.setAttribute('onclick', 'window.localityUnsafe = true');
    block.setAttribute('style', 'color: red; position: fixed');
    block.setAttribute('title', 'Keep');
    editor.setSelection(1, 2);
    editor.format('bold', true);
    return { html: editor.getHTML(), live: editor.surface.firstElementChild!.outerHTML, retained: tail === editor.surface.lastElementChild, selection: editor.getSelection() };
  });
  expect(result.html).toContain('color: red');
  expect(result.html).toContain('title="Keep"');
  expect(result.live).not.toMatch(/onclick|position:/i);
  expect(result.retained).toBe(true);
  expect(result.selection).toEqual({ index: 1, length: 2 });
});

test('an already-applied mark keeps the selected block, live Range, listeners and history unchanged', async ({ page }) => {
  await initialize(page, '<p><strong>abcd</strong></p><p>Tail</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const block = editor.surface.firstElementChild!;
    const text = block.querySelector('strong')!.firstChild!;
    let delivered = 0;
    block.addEventListener('locality-probe', () => { delivered++; });
    editor.setSelection(1, 2);
    const range = window.getSelection()!.getRangeAt(0).cloneRange();
    const html = editor.getHTML();
    editor.format('bold', true);
    editor.surface.firstElementChild!.dispatchEvent(new Event('locality-probe'));
    return { retained: block === editor.surface.firstElementChild, textRetained: text === block.querySelector('strong')!.firstChild, rangeText: range.toString(), delivered, html: editor.getHTML(), before: html, undo: editor.canUndo(), changes: window.changes.length };
  });
  expect(result).toEqual({ retained: true, textRetained: true, rangeText: 'bc', delivered: 1, html: result.before, before: result.before, undo: false, changes: 0 });
});

test('cross-paragraph, atom and unsupported-inline selections keep the existing validated fallback behavior', async ({ page }) => {
  await initialize(page, '<p>ab</p><p>cd</p>');
  await page.evaluate(() => { window.editor.setSelection(1, 2); window.editor.format('bold', true); });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>a<strong>b</strong></p><p><strong>c</strong>d</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>ab</p><p>cd</p>');
  await page.evaluate(() => {
    window.editor.setHTML('<p>ab<br><img src="/logo.svg" alt="Logo">cd</p><p>Tail</p>');
    window.editor.setSelection(1, 2);
    window.editor.format('italic', true);
  });
  await expect(page.locator('.mw-content img')).toHaveCount(1);
  await expect(page.locator('.mw-content br')).toHaveCount(1);
  await expect(page.locator('.mw-content em')).toHaveText(['b', 'c']);
  await expect(page.locator('.mw-content')).toHaveText('abcdTail');
  await page.evaluate(() => {
    window.editor.setHTML('<p>abcd</p><p>Tail</p>');
    window.editor.surface.firstElementChild!.innerHTML = '<mark>abcd</mark>';
    window.editor.setSelection(1, 2);
    window.editor.format('bold', true);
  });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>a<strong>bc</strong>d</p><p>Tail</p>');
  await expect(page.locator('.mw-content mark')).toHaveCount(0);
});

test('external inline ancestors keep inherited mark semantics and read-only remains mutation-free', async ({ page }) => {
  await initialize(page, '<blockquote><strong><p>abcd</p></strong></blockquote><p>Tail</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const before = editor.getHTML();
    editor.setSelection(1, 2);
    editor.format('bold', true);
    const inherited = editor.getHTML();
    const nested = editor.surface.querySelectorAll('strong strong').length;
    editor.setReadOnly(true);
    editor.format('italic', true);
    return { before, inherited, nested, readonly: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result.inherited).toBe(result.before);
  expect(result.nested).toBe(0);
  expect(result.readonly).toBe(result.before);
  expect(result.undo).toBe(false);
});


test('mark removal between plain siblings retains redo selection and following native replacement', async ({ page }) => {
  await initialize(page, '<p>x<strong>ab</strong>y</p><p>Tail</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const original = editor.getHTML();
    editor.setSelection(1, 2);
    editor.format('bold', false);
    const plain = editor.getHTML();
    const selection = editor.getSelection();
    editor.undo();
    const undone = editor.getHTML();
    editor.redo();
    return { original, plain, selection, undone, redone: editor.getHTML(), redoSelection: editor.getSelection() };
  });
  expect(result.plain).toBe('<p>xaby</p><p>Tail</p>');
  expect(result.selection).toEqual({ index: 1, length: 2 });
  expect(result.undone).toBe(result.original);
  expect(result.redone).toBe(result.plain);
  expect(result.redoSelection).toEqual({ index: 1, length: 2 });
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content')).toHaveText('xXyTail');
});


test('enabling a mark preserves existing nested marked text and reaches following plain siblings', async ({ page }) => {
  await initialize(page, '<p><strong>😀a<em>b</em></strong>cd</p><p>Tail</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const original = editor.getHTML();
    editor.setSelection(3, 2);
    editor.format('bold', true);
    const marked = editor.getHTML();
    const selected = window.getSelection()!.toString();
    const selection = editor.getSelection();
    editor.undo();
    const undone = editor.getHTML();
    editor.redo();
    return { original, marked, selected, selection, undone, redone: editor.getHTML(), redoSelection: editor.getSelection() };
  });
  expect(result.marked).toBe('<p><strong>😀a<em>b</em></strong><strong>c</strong>d</p><p>Tail</p>');
  expect(result.selected).toBe('bc');
  expect(result.selection).toEqual({ index: 3, length: 2 });
  expect(result.undone).toBe(result.original);
  expect(result.redone).toBe(result.marked);
  expect(result.redoSelection).toEqual(result.selection);
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content')).toHaveText('😀aXdTail');
});

test('shared mark idempotence keeps cross-block offsets correct after an already marked subtree', async ({ page }) => {
  await initialize(page, '<p><strong>ab</strong>cd</p><p>ef</p>');
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const original = editor.getHTML();
    editor.setSelection(1, 4);
    editor.format('bold', true);
    const marked = editor.getHTML();
    const selected = window.getSelection()!.getRangeAt(0).toString();
    const selection = editor.getSelection();
    editor.undo();
    const undone = editor.getHTML();
    editor.redo();
    return { original, marked, selected, selection, undone, redone: editor.getHTML() };
  });
  expect(result.marked).toBe('<p><strong>ab</strong><strong>cd</strong></p><p><strong>e</strong>f</p>');
  expect(result.selected).toBe('bcde');
  expect(result.selection).toEqual({ index: 1, length: 4 });
  expect(result.undone).toBe(result.original);
  expect(result.redone).toBe(result.marked);
});
