import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, html: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.editor.setHTML(value);
    window.changes.length = 0;
  }, html);
};

const selectOwnEnd = async (page: Page, selector: string) => {
  await page.evaluate((selector) => {
    const root = window.editor.surface;
    const item = root.querySelector(selector)!;
    const range = document.createRange();
    range.selectNodeContents(item);
    const branch = [...item.children].find((node) => /^(ul|ol)$/.test(node.localName));
    if (branch) range.setEndBefore(branch);
    range.collapse(false);
    root.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  }, selector);
};

test('Delete joins rich sibling items at an exact Unicode boundary with separate following input history', async ({ page }) => {
  const original = '<ul style="text-align: right"><li style="text-align: center"><strong>A😀</strong></li><li style="text-align: right"><em>Бв</em></li><li>Keep item</li></ul><p>Keep paragraph</p>';
  const joined = '<ul style="text-align: right"><li style="text-align: center"><strong>A😀</strong><em>Бв</em></li><li>Keep item</li></ul><p>Keep paragraph</p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    const text = root.querySelector('strong')!.firstChild!;
    root.focus();
    document.getSelection()!.setBaseAndExtent(text, 3, text, 3);
  });
  const first = await page.locator('.mw-content > ul > li').first().elementHandle();
  const keep = await page.locator('.mw-content > p').elementHandle();
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ html: joined, selection: { index: 3, length: 0 }, changes: 1 });
  expect(await first!.evaluate((node) => node.isConnected && node === window.editor.surface.querySelector('li'))).toBe(true);
  expect(await keep!.evaluate((node) => node.isConnected && node === window.editor.surface.lastElementChild)).toBe(true);
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content > ul > li').first()).toHaveText('A😀XБв');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 4, length: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(joined);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: original, undo: false });
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return { inOriginalText: selection.anchorNode === window.editor.surface.querySelector('strong')!.firstChild, offset: selection.anchorOffset };
  })).toEqual({ inOriginalText: true, offset: 3 });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual({ html: joined, selection: { index: 3, length: 0 } });
});

test('Delete keeps both nested branches independent and preserves their attributes and DOM identities', async ({ page }) => {
  const original = '<ol><li>Left <ol style="text-align: center"><li>Left branch</li></ol></li><li><em>Right</em><ol style="text-align: right"><li>Right branch</li></ol></li><li>Keep</li></ol>';
  const joined = '<ol><li>Left <em>Right</em><ol style="text-align: center"><li>Left branch</li></ol><ol style="text-align: right"><li>Right branch</li></ol></li><li>Keep</li></ol>';
  await initialize(page, original);
  const branches = await page.locator('.mw-content > ol > li > ol').elementHandles();
  const keep = await page.locator('.mw-content > ol > li').last().elementHandle();
  await selectOwnEnd(page, ':scope > ol > li');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual({ html: joined, selection: { index: 5, length: 0 } });
  await expect(page.locator('.mw-content > ol > li:first-child > ol')).toHaveCount(2);
  for (const [index, handle] of branches.entries()) {
    expect(await handle.evaluate((node, index) => node.isConnected && node === window.editor.surface.querySelectorAll(':scope > ol > li:first-child > ol')[index], index)).toBe(true);
  }
  expect(await keep!.evaluate((node) => node.isConnected && node === window.editor.surface.querySelector(':scope > ol > li:last-child'))).toBe(true);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const range = document.getSelection()!.getRangeAt(0);
    return { parentIsItem: range.startContainer === root.querySelector('li'), beforeRight: range.startContainer.childNodes[range.startOffset] === root.querySelector('li > em') };
  })).toEqual({ parentIsItem: true, beforeRight: true });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('joining placeholder-only bodies keeps one editable break without losing empty inline wrappers or branches', async ({ page }) => {
  const original = '<ul><li><strong><br></strong><ol><li>Left branch</li></ol></li><li><span><br></span><ul><li>Right branch</li></ul></li><li>Keep</li></ul>';
  await initialize(page, original);
  await selectOwnEnd(page, ':scope > ul > li');
  await page.keyboard.press('Delete');
  await expect(page.locator('.mw-content > ul > li')).toHaveCount(2);
  await expect(page.locator('.mw-content > ul > li:first-child > br')).toHaveCount(1);
  await expect(page.locator('.mw-content > ul > li:first-child > strong')).toHaveCount(1);
  await expect(page.locator('.mw-content > ul > li:first-child > span')).toHaveCount(1);
  await expect(page.locator('.mw-content > ul > li:first-child > ol')).toHaveText('Left branch');
  await expect(page.locator('.mw-content > ul > li:first-child > ul')).toHaveText('Right branch');
  const joined = await page.evaluate(() => window.editor.getHTML());
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content > ul > li').first()).toHaveText('XLeft branchRight branch');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(joined);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: original, undo: false });
});

test('Delete at a final own-body edge cannot cross into its branch or an outside paragraph', async ({ page }) => {
  const original = '<ul><li>Only<ul><li>Nested</li></ul></li></ul><p>Outside</p>';
  await initialize(page, original);
  await selectOwnEnd(page, ':scope > ul > li');
  const before = await page.evaluate(() => window.editor.getSelection());
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ html: original, selection: before, undo: false, changes: 0 });
});

test('Delete at the last nested item does not lift or merge into a parent sibling', async ({ page }) => {
  const original = '<ul><li>Outer<ul><li>Inner</li></ul></li><li>Next outer</li></ul>';
  await initialize(page, original);
  await selectOwnEnd(page, 'ul ul > li');
  const before = await page.evaluate(() => window.editor.getSelection());
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ html: original, selection: before, undo: false, changes: 0 });
});

for (const body of ['<p>Block</p><p>body</p>', 'Image<img src="/logo.svg" alt="A">']) test(`unsupported next-item body is an atomic forward-Delete barrier: ${body}`, async ({ page }) => {
  const original = `<ul><li>Left</li><li>${body}</li><li>Keep</li></ul>`;
  await initialize(page, original);
  await selectOwnEnd(page, ':scope > ul > li');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ html: original, undo: false, changes: 0 });
});

test('an unsupported current image body is protected at its actual end', async ({ page }) => {
  const original = '<ul><li>A<img src="/logo.svg" alt="A"></li><li>B</li></ul>';
  await initialize(page, original);
  await selectOwnEnd(page, ':scope > ul > li');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ html: original, undo: false, changes: 0 });
});

test('forward Delete in one merged-cell list preserves the grid and all other cells', async ({ page }) => {
  const original = '<table><tbody><tr><td rowspan="2" colspan="2"><ul><li>A<strong>B</strong></li><li><em>C</em>D</li><li>Keep item</li></ul></td><td><p>Neighbor A</p></td></tr><tr><td><p>Neighbor B</p></td></tr></tbody></table><p>Keep paragraph</p>';
  await initialize(page, original);
  const cell = await page.locator('.mw-content td').first().elementHandle();
  const neighbor = await page.locator('.mw-content td').nth(1).elementHandle();
  await selectOwnEnd(page, 'td > ul > li');
  await page.keyboard.press('Delete');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('rowspan', '2');
  await expect(page.locator('.mw-content td').first()).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td > ul > li').first()).toHaveText('ABCD');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('Neighbor A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('Neighbor B');
  expect(await cell!.evaluate((node) => node === window.editor.surface.querySelector('td') && node.isConnected)).toBe(true);
  expect(await neighbor!.evaluate((node) => node === window.editor.surface.querySelectorAll('td')[1] && node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('an already canceled beforeinput leaves the pair untouched and uncanceled input joins it once', async ({ page }) => {
  const original = '<ul><li>Left</li><li>Right</li></ul>';
  await initialize(page, original);
  await selectOwnEnd(page, ':scope > ul > li');
  const canceled = await page.evaluate(() => {
    const root = window.editor.surface;
    root.addEventListener('beforeinput', (event) => event.preventDefault(), { capture: true, once: true });
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentForward', bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(canceled).toBe(true);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: original, changes: 0, undo: false });
  const handled = await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentForward', bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(handled).toBe(true);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length }))).toEqual({ html: '<ul><li>LeftRight</li></ul>', changes: 1 });
});

for (const mode of ['read-only', 'composition'] as const) test(`${mode} prevents forward joining until the session allows editing`, async ({ page }) => {
  const original = '<ul><li>Left</li><li>Right</li></ul>';
  await initialize(page, original);
  await selectOwnEnd(page, ':scope > ul > li');
  await page.evaluate((mode) => {
    if (mode === 'read-only') window.editor.setReadOnly(true);
    else window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentForward', bubbles: true, cancelable: true }));
  }, mode);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: original, changes: 0, undo: false });
  await page.evaluate((mode) => {
    if (mode === 'read-only') window.editor.setReadOnly(false);
    else window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    window.editor.focus();
  }, mode);
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length }))).toEqual({ html: '<ul><li>LeftRight</li></ul>', changes: 1 });
});

test('an inert last-item barrier keeps pending bold formatting for the following text', async ({ page }) => {
  const original = '<ul><li>Only</li></ul><p>Outside</p>';
  await initialize(page, original);
  await selectOwnEnd(page, ':scope > ul > li');
  await page.evaluate(() => window.editor.format('bold', true));
  expect(await page.evaluate(() => window.editor.getFormats().bold)).toBe(true);
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), bold: window.editor.getFormats().bold, undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ html: original, bold: true, undo: false, changes: 0 });
  await page.keyboard.insertText('X');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ul><li>Only<strong>X</strong></li></ul><p>Outside</p>');
});

test('a real trailing line break stays before the exact join and following native input', async ({ page }) => {
  const original = '<ul><li>A<br></li><li><em>B</em></li></ul>';
  const joined = '<ul><li>A<br><em>B</em></li></ul>';
  await initialize(page, original);
  await selectOwnEnd(page, ':scope > ul > li');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const range = document.getSelection()!.getRangeAt(0);
    return { html: window.editor.getHTML(), previousIsBreak: range.startContainer.childNodes[range.startOffset - 1] === root.querySelector('br'), nextIsSuffix: range.startContainer.childNodes[range.startOffset] === root.querySelector('em') };
  })).toEqual({ html: joined, previousIsBreak: true, nextIsSuffix: true });
  await page.keyboard.insertText('X');
  await expect(page.locator('.mw-content > ul > li')).toHaveText('AXB');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(joined);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('Delete inside an item remains an ordinary native character deletion', async ({ page }) => {
  await initialize(page, '<ul><li>AB</li><li>CD</li></ul>');
  await page.evaluate(() => window.editor.setSelection(1));
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual({ html: '<ul><li>A</li><li>CD</li></ul>', selection: { index: 1, length: 0 } });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ul><li>AB</li><li>CD</li></ul>');
});

test('noncancelable beforeinput keeps native ownership without a manual list join', async ({ page }) => {
  const original = '<ul><li>Left</li><li>Right</li></ul>';
  await initialize(page, original);
  await selectOwnEnd(page, ':scope > ul > li');
  const result = await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentForward', bubbles: true, cancelable: false });
    window.editor.surface.dispatchEvent(event);
    return { prevented: event.defaultPrevented, html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ prevented: false, html: original, changes: 0, undo: false });
});

for (const body of ['<p>Body</p><p>Other</p>', '<pre>Body</pre>', '<blockquote><p>Body</p></blockquote>']) test(`an unsupported block-body text endpoint is protected from a forward cross-item join: ${body}`, async ({ page }) => {
  const original = `<ul><li>${body}</li><li>Right</li></ul>`;
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    const item = root.querySelector('li')!;
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode()!;
    let next = walker.nextNode();
    while (next) {
      text = next;
      next = walker.nextNode();
    }
    const offset = text.textContent!.length;
    root.focus();
    document.getSelection()!.setBaseAndExtent(text, offset, text, offset);
  });
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: original, changes: 0, undo: false });
});

test('a semantic paragraph body keeps its registered identity when a sibling join is blocked', async ({ page }) => {
  const original = '<ul><li>Left</li><li><p data-mw-node="test:list-body" data-id="retained">Right</p></li></ul>';
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes.length = 0;
    window.editor = window.createEditor(host, {
      value,
      schema: [{ name: 'test:list-body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } }],
      onChange: (change) => window.changes.push(change),
    });
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, original);
  await selectOwnEnd(page, ':scope > ul > li');
  await page.keyboard.press('Delete');
  await expect(page.locator('.mw-content [data-mw-node="test:list-body"]')).toHaveAttribute('data-id', 'retained');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: original, changes: 0, undo: false });
});
