import { expect, test } from '@playwright/test';

const initialize = async (page: import('@playwright/test').Page, html: string, index: number, length = 0) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ html, index, length }) => {
    window.editor.setHTML(html);
    window.editor.setSelection(index, length);
  }, { html, index, length });
};

const html = async (page: import('@playwright/test').Page) => page.evaluate(() => window.editor.getHTML());

test('Enter splits rich paragraphs and preserves one-step history and following input', async ({ page }) => {
  const original = '<p style="text-align: center"><strong>abCD</strong><em>ef</em></p><p>Other</p>';
  await initialize(page, original, 2);
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<p style="text-align: center"><strong>ab</strong></p><p style="text-align: center"><strong>CD</strong><em>ef</em></p><p>Other</p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content p').nth(1)).toHaveText('XCDef');
});

test('Enter at heading end exits to paragraph and empty heading becomes paragraph', async ({ page }) => {
  await initialize(page, '<h2 style="text-align: center">Heading</h2><p>Other</p>', 7);
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<h2 style="text-align: center">Heading</h2><p style="text-align: center"><br></p><p>Other</p>');
  await page.keyboard.type('Body');
  await expect(page.locator('.mw-content p').first()).toHaveText('Body');
  await page.evaluate(() => { window.editor.setHTML('<h2><br></h2>'); window.editor.setSelection(0); });
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<p><br></p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<h2><br></h2>');
});

test('Enter in heading interior keeps heading and replaces selected text', async ({ page }) => {
  await initialize(page, '<h3><em>abXYcd</em></h3>', 2, 2);
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<h3><em>ab</em></h3><h3><em>cd</em></h3>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<h3><em>abXYcd</em></h3>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 2 });
});

test('Shift Enter inserts an editable line break without splitting a paragraph', async ({ page }) => {
  await initialize(page, '<p>Line</p>', 4);
  await page.keyboard.press('Shift+Enter');
  expect(await html(page)).toBe('<p>Line<br><br></p>');
  await page.keyboard.type('Next');
  await expect(page.locator('.mw-content p')).toHaveCount(1);
  await expect(page.getByRole('textbox')).toHaveText('LineNext');
  expect(await html(page)).toContain('Line<br>Next');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe('<p>Line</p>');
});

for (const key of ['Backspace', 'Delete'] as const) {
  test(`${key} joins adjacent rich blocks at the exact Unicode boundary with undo and redo`, async ({ page }) => {
    const original = '<h2><strong>A😀</strong></h2><p><em>Бв</em></p><p>Other</p>';
    await initialize(page, original, 3);
    if (key === 'Backspace') {
      await page.evaluate(() => {
        const block = window.editor.surface.querySelector('p')!;
        const range = document.createRange();
        range.selectNodeContents(block);
        range.collapse(true);
        document.getSelection()!.removeAllRanges();
        document.getSelection()!.addRange(range);
      });
    }
    await page.keyboard.press(key);
    expect(await html(page)).toBe('<h2><strong>A😀</strong><em>Бв</em></h2><p>Other</p>');
    expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 3, length: 0 });
    await page.evaluate(() => window.editor.undo());
    expect(await html(page)).toBe(original);
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
    await page.evaluate(() => window.editor.redo());
    await page.keyboard.type('X');
    await expect(page.getByRole('textbox')).toHaveText('A😀XБвOther');
  });
}

test('deletion barriers preserve tables figures and lists instead of native cross-merges', async ({ page }) => {
  for (const barrier of ['<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>', '<figure><img src="https://example.test/a.png" alt="A"></figure>', '<ul><li>Item</li></ul>']) {
    await initialize(page, `<p>Left</p>${barrier}<p>Right</p>`, 4);
    const before = await html(page);
    await page.keyboard.press('Delete');
    expect(await html(page)).toBe(before);
    await page.evaluate(() => {
      const block = window.editor.surface.lastElementChild!;
      const range = document.createRange();
      range.selectNodeContents(block);
      range.collapse(true);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    });
    await page.keyboard.press('Backspace');
    expect(await html(page)).toBe(before);
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  }
});

test('boundary deletion cannot move content between merged table cells', async ({ page }) => {
  const original = '<table><tbody><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td></tr></tbody></table><p><br></p>';
  await initialize(page, original, 0);
  await page.evaluate(() => {
    const block = window.editor.surface.querySelectorAll('td p')[1]!;
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Backspace');
  expect(await html(page)).toBe(original);
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(window.editor.surface.querySelectorAll('td p')[1]!);
    range.collapse(false);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Delete');
  expect(await html(page)).toBe(original);
});

test('beforeinput paragraph insertion supports the same bounded transaction without keyboard dispatch', async ({ page }) => {
  await initialize(page, '<p>abcd</p>', 2);
  const prevented = await page.evaluate(() => !window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true })));
  expect(prevented).toBe(true);
  expect(await html(page)).toBe('<p>ab</p><p>cd</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>abcd</p>');
});

test('composition and read-only guards leave structural block input untouched', async ({ page }) => {
  await initialize(page, '<h2>ab</h2>', 2);
  const result = await page.evaluate(() => {
    const composing = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(composing);
    const input = new InputEvent('beforeinput', { inputType: 'insertParagraph', isComposing: true, bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(input);
    return { keyPrevented: composing.defaultPrevented, inputPrevented: input.defaultPrevented, html: window.editor.getHTML() };
  });
  expect(result).toEqual({ keyPrevented: false, inputPrevented: false, html: '<h2>ab</h2>' });
  await page.evaluate(() => window.editor.setReadOnly(true));
  const blocked = await page.evaluate(() => ['insertParagraph', 'deleteContentBackward'].map((inputType) => {
    const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  }));
  expect(blocked).toEqual([true, true]);
  expect(await html(page)).toBe('<h2>ab</h2>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

for (const lineBreak of [false, true]) test(`joining blocks retains the DOM caret after ${lineBreak ? 'a line break' : 'merged text'} through history`, async ({ page }) => {
  const original = lineBreak ? '<p>A<br></p><p>B</p>' : '<p>A</p><p>B</p>';
  await initialize(page, original, 1);
  await page.evaluate(() => {
    const block = window.editor.surface.querySelector('p')!;
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Delete');
  expect(await html(page)).toBe(lineBreak ? '<p>A<br>B</p>' : '<p>AB</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('X');
  expect(await html(page)).toBe(lineBreak ? '<p>A<br>XB</p>' : '<p>AXB</p>');
});

test('empty rich heading exits and empty paragraph Shift Enter has one editable new line', async ({ page }) => {
  await initialize(page, '<h2><strong><br></strong></h2>', 0);
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<p><br></p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<h2><strong><br></strong></h2>');
  await page.evaluate(() => { window.editor.setHTML('<p><br></p>'); window.editor.setSelection(0); });
  await page.keyboard.press('Shift+Enter');
  expect(await html(page)).toBe('<p><br><br></p>');
  await page.keyboard.type('Next');
  expect(await html(page)).toContain('<p><br>Next');
});

test('empty paragraph Delete at a structural barrier leaves the placeholder and history unchanged', async ({ page }) => {
  const original = '<p><br></p><table><tbody><tr><td><p>Cell</p></td></tr></tbody></table><p><br></p>';
  await initialize(page, original, 0);
  await page.evaluate(() => {
    const range = document.createRange();
    range.setStart(window.editor.surface.firstElementChild!, 0);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.keyboard.press('Delete');
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});
