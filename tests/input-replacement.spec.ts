import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const rich = '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2><p>Keep</p>';
const initialize = async (page: Page, value = rich, schema: SchemaNodeSpec[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ value, schema }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value, schema, onChange: (change) => window.changes.push(change) });
    window.editor.focus();
  }, { value, schema });
};
const selectRich = async (page: Page, backward = false) => {
  await page.evaluate((backward) => {
    const root = window.editor.surface;
    const start = root.querySelector('p')!.firstChild!;
    const end = root.querySelector('h2 em')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(backward ? end : start, backward ? 2 : 6, backward ? start : end, backward ? 6 : 2);
    root.lastElementChild!.setAttribute('data-test-identity', 'keep');
  }, backward);
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const beforeinput = (page: Page, inputType: string, data: string | null = null) => page.evaluate(({ inputType, data }) => {
  const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, { inputType, data });

for (const backward of [false, true]) test(`native text replaces a ${backward ? 'backward' : 'forward'} rich cross-leaf range with isolated history and an exact next typing caret`, async ({ page }) => {
  await initialize(page);
  await selectRich(page, backward);
  await page.keyboard.type('X');
  const replaced = '<p>Alpha X<em>ta</em> tail</p><p>Keep</p>';
  expect(await html(page)).toBe(replaced);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 7, length: 0 });
  await expect(page.locator('[data-test-identity="keep"]')).toHaveText('Keep');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(rich);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 6, length: 5 });
  expect(await page.evaluate(() => document.getSelection()!.anchorNode!.parentElement!.closest('h2') !== null)).toBe(backward);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('Y');
  expect(await html(page)).toBe('<p>Alpha XY<em>ta</em> tail</p><p>Keep</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(replaced);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(rich);
});

for (const key of ['Backspace', 'Delete']) test(`${key} normalizes a backwards cross-leaf range into the left wrapper and restores direction through undo`, async ({ page }) => {
  await initialize(page);
  await selectRich(page, true);
  await page.keyboard.press(key);
  expect(await html(page)).toBe('<p>Alpha <em>ta</em> tail</p><p>Keep</p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 6, length: 0 });
  await expect(page.locator('[data-test-identity="keep"]')).toHaveText('Keep');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(rich);
  expect(await page.evaluate(() => document.getSelection()!.anchorNode!.parentElement!.closest('h2') !== null)).toBe(true);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('Y');
  expect(await html(page)).toBe('<p>Alpha Y<em>ta</em> tail</p><p>Keep</p>');
});

for (const type of ['insertText', 'deleteContentBackward', 'deleteContentForward']) test(`beforeinput-only ${type} follows the same replacement and history path`, async ({ page }) => {
  await initialize(page);
  await selectRich(page);
  expect(await beforeinput(page, type, type === 'insertText' ? '<b>X</b>' : null)).toBe(true);
  const text = type === 'insertText' ? '&lt;b&gt;X&lt;/b&gt;' : '';
  expect(await html(page)).toBe(`<p>Alpha ${text}<em>ta</em> tail</p><p>Keep</p>`);
  await expect(page.locator('.mw-content b')).toHaveCount(0);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(rich);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 6, length: 5 });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('replacement preserves starting inline affinity and right-hand links rather than adopting right-hand formatting', async ({ page }) => {
  const original = '<p><strong>abCD</strong></p><h3><a href="https://example.com">efGH</a></h3><p>Keep</p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('strong')!.firstChild!, 2, root.querySelector('a')!.firstChild!, 2);
  });
  await page.keyboard.type('X');
  expect(await html(page)).toBe('<p><strong>abX</strong><a href="https://example.com">GH</a></p><p>Keep</p>');
  await page.keyboard.type('Y');
  await expect(page.locator('.mw-content strong')).toHaveText('abXY');
  await expect(page.locator('.mw-content a')).toHaveText('GH');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(original);
});

test('left heading attributes and node identity survive removal of covered middle leaves', async ({ page }) => {
  const original = '<h2 style="text-align: center">Left</h2><p>Middle</p><h3><em>Right</em></h3><p>Keep</p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.firstElementChild!.setAttribute('data-test-identity', 'left');
    root.lastElementChild!.setAttribute('data-test-identity', 'keep');
    document.getSelection()!.setBaseAndExtent(root.querySelector('h2')!.firstChild!, 2, root.querySelector('h3 em')!.firstChild!, 2);
  });
  await page.keyboard.type('X');
  expect(await html(page)).toBe('<h2 style="text-align: center">LeX<em>ght</em></h2><p>Keep</p>');
  await expect(page.locator('[data-test-identity="left"]')).toHaveCount(1);
  await expect(page.locator('[data-test-identity="keep"]')).toHaveCount(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
});

test('Unicode boundaries preserve whole surrogate pairs and combining sequences with exact UTF-16 caret offsets', async ({ page }) => {
  const original = '<p>😀é<em>gone</em></p><h2><strong>Ж😀éZ</strong></h2><p>Keep</p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!.firstChild!, 4, root.querySelector('h2 strong')!.firstChild!, 5);
  });
  expect(await beforeinput(page, 'insertText', '漢')).toBe(true);
  expect(await html(page)).toBe('<p>😀é漢<strong>Z</strong></p><p>Keep</p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 5, length: 0 });
  await page.keyboard.type('X');
  expect(await html(page)).toBe('<p>😀é漢X<strong>Z</strong></p><p>Keep</p>');
});

test('real br node boundaries retain line breaks and place subsequent typing before the suffix break', async ({ page }) => {
  await initialize(page, '<p>A<br><strong>BC</strong></p><h2><em>DE</em><br>F</h2><p>Keep</p>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!, 2, root.querySelector('h2')!, 1);
  });
  expect(await beforeinput(page, 'insertText', 'X')).toBe(true);
  expect(await html(page)).toBe('<p>A<br>X<br>F</p><p>Keep</p>');
  await page.keyboard.type('Y');
  expect(await html(page)).toBe('<p>A<br>XY<br>F</p><p>Keep</p>');
});

for (const startOffset of [0, 1]) test(`empty leaf placeholder at DOM offset ${startOffset} is not copied into replacement text`, async ({ page }) => {
  await initialize(page, '<p><br></p><h2><em>Tail</em></h2><p>Keep</p>');
  await page.evaluate((offset) => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!, offset, root.querySelector('h2 em')!.firstChild!, 2);
  }, startOffset);
  expect(await beforeinput(page, 'insertText', 'X')).toBe(true);
  expect(await html(page)).toBe('<p>X<em>il</em></p><p>Keep</p>');
  await page.keyboard.type('Y');
  expect(await html(page)).toBe('<p>XY<em>il</em></p><p>Keep</p>');
});

test('an empty marked starting leaf keeps its inline text affinity when the placeholder is removed', async ({ page }) => {
  await initialize(page, '<p><strong><br></strong></p><h2><em>Tail</em></h2><p>Keep</p>');
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p strong')!, 1, root.querySelector('h2 em')!.firstChild!, 2);
  });
  expect(await beforeinput(page, 'insertText', 'X')).toBe(true);
  expect(await html(page)).toBe('<p><strong>X</strong><em>il</em></p><p>Keep</p>');
  await page.keyboard.type('Y');
  await expect(page.locator('.mw-content strong')).toHaveText('XY');
});

const inlineSchema: SchemaNodeSpec[] = [{ name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } }];

test('empty semantic inline starting context retains required metadata and typed text', async ({ page }) => {
  const original = '<p><span data-mw-node="test:reference" data-id="start"><br></span></p><h2><em>Tail</em></h2><p>Keep</p>';
  await initialize(page, original, inlineSchema);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p span')!, 1, root.querySelector('h2 em')!.firstChild!, 2);
  });
  expect(await beforeinput(page, 'insertText', 'X')).toBe(true);
  expect(await html(page)).toBe('<p><span data-mw-node="test:reference" data-id="start">X</span><em>il</em></p><p>Keep</p>');
  await page.keyboard.type('Y');
  await expect(page.locator('.mw-content [data-id="start"]')).toHaveText('XY');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe(original);
});

test('an unselected empty semantic inline suffix is retained instead of mistaken for an empty leaf placeholder', async ({ page }) => {
  const original = '<p>AX</p><h2><span data-mw-node="test:reference" data-id="tail"><br></span></h2><p>Keep</p>';
  await initialize(page, original, inlineSchema);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!.firstChild!, 1, root.querySelector('h2')!, 0);
  });
  expect(await beforeinput(page, 'insertText', 'Z')).toBe(true);
  expect(await html(page)).toBe('<p>AZ<span data-mw-node="test:reference" data-id="tail"></span></p><p>Keep</p>');
  await expect(page.locator('.mw-content [data-id="tail"]')).toHaveCount(1);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
});

test('a fully empty replacement preserves semantic inline metadata and one editable placeholder at its original affinity', async ({ page }) => {
  const original = '<p><span data-mw-node="test:reference" data-id="start"><br></span></p><h2><br></h2><p>Keep</p>';
  await initialize(page, original, inlineSchema);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p span')!, 1, root.querySelector('h2')!, 0);
  });
  expect(await beforeinput(page, 'deleteContentBackward')).toBe(true);
  expect(await html(page)).toBe('<p><span data-mw-node="test:reference" data-id="start"><br></span></p><p>Keep</p>');
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content [data-id="start"]')).toHaveText('X');
});

test('fully selected empty and rich leaves become one editable placeholder and restore real empty boundaries on undo', async ({ page }) => {
  const original = '<p><br></p><h2><strong>Gone</strong></h2><p>Keep</p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!, 0, root.querySelector('h2')!, 1);
  });
  expect(await beforeinput(page, 'deleteContentForward')).toBe(true);
  expect(await html(page)).toBe('<p><br></p><p>Keep</p>');
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.firstElementChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ node: true, offset: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => ({ node: document.getSelection()!.anchorNode === window.editor.surface.firstElementChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ node: true, offset: 0 });
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content p').first()).toHaveText('X');
});

for (const container of ['blockquote', 'merged-cell']) test(`replacement stays inside one ${container} and preserves unrelated containers`, async ({ page }) => {
  const body = '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2>';
  const original = container === 'blockquote'
    ? `<blockquote>${body}</blockquote><p>Keep</p>`
    : `<table><tbody><tr><td colspan="2" rowspan="2">${body}</td><td><p>Other</p></td></tr><tr><td><p>Keep cell</p></td></tr></tbody></table><p>Keep</p>`;
  await initialize(page, original);
  await selectRich(page, true);
  if (container === 'merged-cell') await page.evaluate(() => window.editor.surface.querySelectorAll('td')[1].setAttribute('data-test-identity', 'other'));
  await page.keyboard.type('X');
  const result = original.replace(body, '<p>Alpha X<em>ta</em> tail</p>');
  expect(await html(page)).toBe(result);
  await expect(page.locator('[data-test-identity="keep"]')).toHaveText('Keep');
  if (container === 'merged-cell') await expect(page.locator('[data-test-identity="other"]')).toHaveText('Other');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('replacement is isolated from a preceding typing burst instead of swallowing its undo entry', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.editor.setSelection(0));
  await page.keyboard.type('Q');
  const typed = await html(page);
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('p')!.firstChild!, 7, root.querySelector('h2 em')!.firstChild!, 2);
  });
  await page.keyboard.type('X');
  expect(await html(page)).toBe('<p>QAlpha X<em>ta</em> tail</p><p>Keep</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(typed);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(rich);
});
