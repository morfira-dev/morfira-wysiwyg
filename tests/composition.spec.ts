import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => {
    window.editor.setHTML('<p>Start</p>');
    window.editor.setSelection(5);
    window.changes.length = 0;
  });
});

for (const finalOrder of ['before-end', 'after-end', 'amend-after-end', 'empty-end-final', 'supported-after-end'] as const) {
  test(`composition ${finalOrder} retains one undo revision and following typing is separate`, async ({ page }) => {
    const interim = await page.evaluate((order) => {
      const editor = window.editor;
      // Chromium drops legacy composition inputType values in the constructor.
      // Preserve the declared protocol explicitly; these are simulated events.
      const finalInput = (type: 'beforeinput' | 'input') => {
        const inputType = order === 'supported-after-end' ? 'insertCompositionText' : 'insertFromComposition';
        const event = new InputEvent(type, { inputType, data: '日本', bubbles: true });
        if (inputType === 'insertFromComposition')
          Object.defineProperty(event, 'inputType', { value: inputType });
        if (event.inputType !== inputType)
          throw new Error(`Synthetic composition protocol was not preserved: ${event.inputType}`);
        editor.surface.dispatchEvent(event);
      };
      editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      editor.surface.querySelector('p')!.textContent = 'Startに';
      editor.setSelection(6);
      editor.surface.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true, data: 'に', bubbles: true }));
      const interim = { changes: window.changes.length, undo: editor.canUndo() };
      if (order === 'empty-end-final') {
        editor.surface.querySelector('p')!.textContent = 'Start';
        editor.setSelection(5);
      }
      else if (order !== 'amend-after-end' && order !== 'supported-after-end') {
        editor.surface.querySelector('p')!.textContent = 'Start日本';
        editor.setSelection(7);
      }
      if (order === 'before-end')
        finalInput('input');
      editor.surface.dispatchEvent(new CompositionEvent('compositionend', { data: '日本', bubbles: true }));
      if (order === 'amend-after-end' || order === 'empty-end-final' || order === 'supported-after-end') {
        editor.surface.querySelector('p')!.textContent = 'Start日本';
        editor.setSelection(7);
      }
      if (order !== 'before-end') {
        finalInput('beforeinput');
        finalInput('input');
      }
      return interim;
    }, finalOrder);
    expect(interim).toEqual({ changes: 0, undo: false });
    await expect(page.getByRole('textbox')).toHaveText('Start日本');
    expect(await page.evaluate(() => window.changes.length)).toBe(finalOrder === 'amend-after-end' || finalOrder === 'supported-after-end' ? 2 : 1);
    await page.evaluate(() => window.editor.undo());
    expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ html: '<p>Start</p>', selection: { index: 5, length: 0 }, undo: false });
    await page.evaluate(() => window.editor.redo());
    expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 7, length: 0 });
    await page.keyboard.type('!');
    await expect(page.getByRole('textbox')).toHaveText('Start日本!');
    await page.evaluate(() => window.editor.undo());
    await expect(page.getByRole('textbox')).toHaveText('Start日本');
    await page.evaluate(() => window.editor.undo());
    await expect(page.getByRole('textbox')).toHaveText('Start');
  });
}

test('unchanged cancellation and repeated compositionstart preserve the original baseline', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.surface.querySelector('p')!.textContent = 'Start仮';
    editor.surface.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true, bubbles: true }));
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.surface.querySelector('p')!.textContent = 'Start';
    editor.setSelection(5);
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { html: editor.getHTML(), undo: editor.canUndo(), changes: window.changes.length };
  });
  expect(result).toEqual({ html: '<p>Start</p>', undo: false, changes: 0 });
});

test('same-value acknowledgement preserves active composition and user edit commands are ignored', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.surface.querySelector('p')!.textContent = 'Start한';
    editor.setSelection(6);
    editor.setHTML(editor.getHTML());
    let invoked = false;
    editor.transact(() => { invoked = true; });
    editor.insertHTML('blocked');
    editor.format('bold', true);
    editor.undo();
    editor.redo();
    const middle = { html: editor.getHTML(), undo: editor.canUndo(), invoked, bold: Boolean(editor.getFormats().bold) };
    editor.surface.querySelector('p')!.textContent = 'Start한국';
    editor.setSelection(7);
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    editor.undo();
    return { middle, html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo() };
  });
  expect(result).toEqual({ middle: { html: '<p>Start한</p>', undo: false, invoked: false, bold: false }, html: '<p>Start</p>', selection: { index: 5, length: 0 }, undo: false });
});

for (const replacement of ['html', 'json'] as const) {
  test(`external ${replacement} replacement invalidates active composition and late input`, async ({ page }) => {
    const result = await page.evaluate((format) => {
      const editor = window.editor;
      editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      editor.surface.querySelector('p')!.textContent = 'Start候補';
      if (format === 'html') editor.setHTML('<p>External</p>');
      else editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text: 'External' }] }] });
      editor.setSelection(8);
      editor.surface.querySelector('p')!.textContent = 'stale';
      editor.surface.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true, bubbles: true }));
      editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      editor.surface.querySelector('p')!.textContent = 'late';
      const finalInput = new InputEvent('input', { inputType: 'insertFromComposition', bubbles: true });
      Object.defineProperty(finalInput, 'inputType', { value: 'insertFromComposition' });
      if (finalInput.inputType !== 'insertFromComposition')
        throw new Error('Synthetic legacy composition inputType was not preserved.');
      editor.surface.dispatchEvent(finalInput);
      return { html: editor.getHTML(), undo: editor.canUndo(), sources: window.changes.map((change) => change.source) };
    }, replacement);
    expect(result).toEqual({ html: '<p>External</p>', undo: false, sources: ['api'] });
    await page.evaluate(() => window.editor.setSelection(8));
    await page.keyboard.type('!');
    await expect(page.getByRole('textbox')).toHaveText('External!');
  });
}

test('read-only cancellation rolls back provisional content and preserves earlier history', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    editor.insertHTML('!');
    window.changes.length = 0;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.surface.querySelector('p')!.textContent = 'Start!仮';
    editor.setSelection(7);
    editor.setReadOnly(true);
    const canceled = { html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length };
    editor.setReadOnly(false);
    editor.surface.querySelector('p')!.textContent = 'late';
    editor.surface.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true, bubbles: true }));
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    editor.undo();
    return { canceled, html: editor.getHTML(), undo: editor.canUndo() };
  });
  expect(result).toEqual({ canceled: { html: '<p>Start!</p>', selection: { index: 6, length: 0 }, changes: 0 }, html: '<p>Start</p>', undo: false });
});

test('legacy 229 keyboard events bypass core shortcuts and structural handlers', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<ul><li>Item</li></ul>');
    editor.setSelection(0);
    const events = [new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 229, bubbles: true, cancelable: true }), new KeyboardEvent('keydown', { key: 'b', keyCode: 229, ctrlKey: true, bubbles: true, cancelable: true })];
    for (const event of events) editor.surface.dispatchEvent(event);
    return { html: editor.getHTML(), bold: Boolean(editor.getFormats().bold), prevented: events.map((event) => event.defaultPrevented), undo: editor.canUndo() };
  });
  expect(result).toEqual({ html: '<ul><li>Item</li></ul>', bold: false, prevented: [false, false], undo: false });
});

test('destroy removes pending composition listeners without affecting another editor', async ({ page }) => {
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const surface = editor.surface;
    surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.destroy();
    surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    surface.dispatchEvent(new InputEvent('input', { inputType: 'insertFromComposition', bubbles: true }));
    const host = document.createElement('div');
    document.body.append(host);
    const next = window.createEditor(host, { value: '<p>Other</p>' });
    next.setSelection(5);
    next.insertHTML('!');
    const html = next.getHTML();
    next.destroy();
    host.remove();
    return { html, connected: surface.isConnected };
  });
  expect(result).toEqual({ html: '<p>Other!</p>', connected: false });
});
