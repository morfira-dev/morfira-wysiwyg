import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EditorDocument, SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const original = '<p>Alpha</p><h2>Beta</h2><p>Keep</p>';

const initialize = async (page: Page, html = original, schema: SchemaNodeSpec[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ html, schema }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value: html, schema, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
  }, { html, schema });
};

const selectRange = async (page: Page) => {
  await page.evaluate(() => {
    const surface = window.editor.surface;
    surface.focus();
    const range = document.createRange();
    range.setStart(surface.querySelector('p')!.firstChild!, 2);
    range.setEnd(surface.querySelector('h2')!.firstChild!, 2);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
};

test('a canceled beforeinput leaves a multi-block range, content and history intact', async ({ page }) => {
  await initialize(page);
  await selectRange(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const selection = editor.getSelection();
    const cancel = (event: Event) => event.preventDefault();
    editor.surface.addEventListener('beforeinput', cancel, { capture: true });
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true });
    editor.surface.dispatchEvent(event);
    editor.surface.removeEventListener('beforeinput', cancel, { capture: true });
    return { html: editor.getHTML(), before: selection, after: editor.getSelection(), canceled: event.defaultPrevented, changes: window.changes.length, undo: editor.canUndo(), redo: editor.canRedo() };
  });
  expect(result).toEqual({ html: original, before: { index: 2, length: 5 }, after: { index: 2, length: 5 }, canceled: true, changes: 0, undo: false, redo: false });
  await page.keyboard.type('X');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AlXta</p><p>Keep</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ html: original, selection: { index: 2, length: 5 }, undo: false });
});

test('read-only prevents replacement and deletion, then ordinary editing resumes at the retained range', async ({ page }) => {
  await initialize(page);
  await selectRange(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    editor.setReadOnly(true);
    const canceled = ['insertText', 'deleteContentBackward', 'deleteContentForward'].map((inputType) => {
      const event = new InputEvent('beforeinput', { inputType, data: inputType === 'insertText' ? 'X' : null, bubbles: true, cancelable: true });
      editor.surface.dispatchEvent(event);
      return event.defaultPrevented;
    });
    return { canceled, html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length, undo: editor.canUndo() };
  });
  expect(result).toEqual({ canceled: [true, true, true], html: original, selection: { index: 2, length: 5 }, changes: 0, undo: false });
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.focus(); });
  await expect(page.getByRole('textbox')).toBeFocused();
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 5 });
  await page.keyboard.type('X');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AlXta</p><p>Keep</p>');
});

for (const protocol of ['active-session', 'event-flag'] as const) {
  test(`composition ${protocol} retains native ownership of a multi-block range`, async ({ page }) => {
    await initialize(page);
    await selectRange(page);
    const result = await page.evaluate((protocol) => {
      const editor = window.editor;
      if (protocol === 'active-session') editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const event = new InputEvent('beforeinput', { inputType: 'insertText', data: '候補', isComposing: protocol === 'event-flag', bubbles: true, cancelable: true });
      editor.surface.dispatchEvent(event);
      const during = { prevented: event.defaultPrevented, html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length, undo: editor.canUndo() };
      if (protocol === 'active-session') editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      return { during, changes: window.changes.length, undo: editor.canUndo() };
    }, protocol);
    expect(result).toEqual({ during: { prevented: false, html: original, selection: { index: 2, length: 5 }, changes: 0, undo: false }, changes: 0, undo: false });
    await page.keyboard.type('X');
    expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AlXta</p><p>Keep</p>');
  });
}

test('null text and unsupported input protocols are not consumed as ordinary text replacement', async ({ page }) => {
  await initialize(page);
  await selectRange(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const cases = [
      { inputType: 'insertText', data: null },
      { inputType: 'insertReplacementText', data: 'spelling' },
      { inputType: 'insertFromPaste', data: 'pasted' },
      { inputType: 'insertFromDrop', data: 'dropped' },
      { inputType: 'deleteWordBackward', data: null },
    ];
    const prevented = cases.map(({ inputType, data }) => {
      const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
      if (event.inputType !== inputType) throw new Error(`Synthetic input protocol changed: ${event.inputType}`);
      editor.surface.dispatchEvent(event);
      return event.defaultPrevented;
    });
    // Untrusted beforeinput does not perform a browser-native edit. This checks
    // that the new bounded handler neither owns nor mutates unsupported input.
    return { prevented, html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length, undo: editor.canUndo() };
  });
  expect(result).toEqual({ prevented: [false, false, false, false, false], html: original, selection: { index: 2, length: 5 }, changes: 0, undo: false });
});

test('noncancelable beforeinput retains browser ownership without a second replacement', async ({ page }) => {
  await initialize(page);
  await selectRange(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const prevented = ['insertText', 'deleteContentBackward', 'deleteContentForward'].map((inputType) => {
      const event = new InputEvent('beforeinput', { inputType, data: inputType === 'insertText' ? 'X' : null, bubbles: true, cancelable: false });
      editor.surface.dispatchEvent(event);
      return event.defaultPrevented;
    });
    return { prevented, html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length, undo: editor.canUndo() };
  });
  expect(result).toEqual({ prevented: [false, false, false], html: original, selection: { index: 2, length: 5 }, changes: 0, undo: false });
});

test('structural barriers and different parents remain outside the ordinary sibling replacement path', async ({ page }) => {
  const cases = [
    { html: '<p>Alpha</p><table><tbody><tr><td><p>Cell</p></td></tr></tbody></table><p>Beta</p>', first: '.mw-content > p:first-child', last: '.mw-content > p:last-child' },
    { html: '<p>Alpha</p><figure><img src="https://example.test/image.png" alt="Image"></figure><p>Beta</p>', first: '.mw-content > p:first-child', last: '.mw-content > p:last-child' },
    { html: '<p>Alpha</p><ul><li>Item</li></ul><p>Beta</p>', first: '.mw-content > p:first-child', last: '.mw-content > p:last-child' },
    { html: '<p>Alpha</p><pre>Code</pre><p>Beta</p>', first: '.mw-content > p:first-child', last: '.mw-content > p:last-child' },
    { html: '<p>Alpha</p><hr><p>Beta</p>', first: '.mw-content > p:first-child', last: '.mw-content > p:last-child' },
    { html: '<blockquote><p>Alpha</p></blockquote><p>Beta</p>', first: 'blockquote > p', last: '.mw-content > p' },
    { html: '<table><tbody><tr><td rowspan="2"><p>Alpha</p></td><td><p>Beta</p></td></tr><tr><td><p>Other</p></td></tr></tbody></table>', first: 'td[rowspan] > p', last: 'td:nth-child(2) > p' },
  ];
  for (const fixture of cases) {
    await initialize(page, fixture.html);
    const before = await page.evaluate(() => window.editor.getHTML());
    const result = await page.evaluate(({ first, last }) => {
      const editor = window.editor;
      editor.surface.focus();
      const range = document.createRange();
      range.setStart(document.querySelector(first)!.firstChild!, 2);
      range.setEnd(document.querySelector(last)!.firstChild!, 2);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      const selected = selection.toString();
      const prevented = ['insertText', 'deleteContentBackward', 'deleteContentForward'].map((inputType) => {
        const event = new InputEvent('beforeinput', { inputType, data: inputType === 'insertText' ? 'X' : null, bubbles: true, cancelable: true });
        editor.surface.dispatchEvent(event);
        return event.defaultPrevented;
      });
      return { html: editor.getHTML(), prevented, selected, after: selection.toString(), changes: window.changes.length, undo: editor.canUndo() };
    }, fixture);
    expect(result, fixture.html).toEqual({ html: before, prevented: [false, false, false], selected: result.selected, after: result.selected, changes: 0, undo: false });
    expect(result.selected.length, fixture.html).toBeGreaterThan(0);
  }
});

test('registered semantic leaf identities remain outside ordinary range replacement', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.editor.destroy();
    const host = document.createElement('div');
    document.body.append(host);
    const html = '<p>Alpha</p><h2 data-mw-node="test:heading" data-id="saved">Beta</h2><p>Keep</p>';
    window.editor = window.createEditor(host, {
      value: html,
      schema: [{ name: 'test:heading', kind: 'block', tag: 'h2', attributes: { 'data-id': { type: 'text', required: true } } }],
      onChange: (change) => window.changes.push(change),
    });
    const editor = window.editor;
    editor.surface.focus();
    const range = document.createRange();
    range.setStart(editor.surface.querySelector('p')!.firstChild!, 2);
    range.setEnd(editor.surface.querySelector('h2')!.firstChild!, 2);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true });
    editor.surface.dispatchEvent(event);
    return { html: editor.getHTML(), original: html, prevented: event.defaultPrevented, changes: window.changes.length, undo: editor.canUndo() };
  });
  expect(result).toEqual({ html: result.original, original: result.original, prevented: false, changes: 0, undo: false });
  await expect(page.locator('[data-mw-node="test:heading"]')).toHaveText('Beta');
  await expect(page.locator('[data-mw-node="test:heading"]')).toHaveAttribute('data-id', 'saved');
});

test('failed external validation preserves the selected document and a later replacement uses the fresh external range', async ({ page }) => {
  await initialize(page);
  await selectRange(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    let rejected = false;
    // Incoming JSON is untyped outside TypeScript consumers; exercise validation.
    try { editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'script', attributes: {}, children: [] }] } as unknown as EditorDocument); }
    catch { rejected = true; }
    return { rejected, html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length, undo: editor.canUndo() };
  });
  expect(result).toEqual({ rejected: true, html: original, selection: { index: 2, length: 5 }, changes: 0, undo: false });
  await page.evaluate(() => {
    window.editor.setHTML('<p>New</p><h2>Body</h2><p>Stay</p>');
    window.changes.length = 0;
    const root = window.editor.surface;
    const range = document.createRange();
    range.setStart(root.querySelector('p')!.firstChild!, 1);
    range.setEnd(root.querySelector('h2')!.firstChild!, 2);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    root.focus();
  });
  await page.keyboard.type('X');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ html: '<p>NXdy</p><p>Stay</p>', selection: { index: 2, length: 0 }, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: '<p>New</p><h2>Body</h2><p>Stay</p>', undo: false });
});

test('a noncollapsed DOM range with zero text length replaces the block boundary and restores its backwards endpoints', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    const left = root.querySelector('p')!.firstChild!;
    const right = root.querySelector('h2')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(right, 0, left, 5);
    return { collapsed: document.getSelection()!.getRangeAt(0).collapsed, text: document.getSelection()!.getRangeAt(0).toString(), selection: window.editor.getSelection() };
  });
  expect(before).toEqual({ collapsed: false, text: '', selection: { index: 5, length: 0 } });
  await page.keyboard.type('X');
  const replaced = '<p>AlphaXBeta</p><p>Keep</p>';
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ html: replaced, selection: { index: 6, length: 0 }, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    return {
      html: window.editor.getHTML(),
      anchorIsRight: selection.anchorNode === root.querySelector('h2')!.firstChild,
      anchorOffset: selection.anchorOffset,
      focusIsLeft: selection.focusNode === root.querySelector('p')!.firstChild,
      focusOffset: selection.focusOffset,
      collapsed: selection.getRangeAt(0).collapsed,
      undo: window.editor.canUndo(),
    };
  })).toEqual({ html: original, anchorIsRight: true, anchorOffset: 0, focusIsLeft: true, focusOffset: 5, collapsed: false, undo: false });
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('Y');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AlphaXYBeta</p><p>Keep</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(replaced);
});

test('an empty insertText payload deletes the selected sibling content as one isolated replacement', async ({ page }) => {
  await initialize(page);
  await selectRange(page);
  const result = await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: '', bubbles: true, cancelable: true });
    if (event.data !== '') throw new Error('Synthetic empty text payload was not preserved.');
    window.editor.surface.dispatchEvent(event);
    return { prevented: event.defaultPrevented, html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length };
  });
  const replaced = '<p>Alta</p><p>Keep</p>';
  expect(result).toEqual({ prevented: true, html: replaced, selection: { index: 2, length: 0 }, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ html: original, selection: { index: 2, length: 5 }, undo: false });
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('Y');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>AlYta</p><p>Keep</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(replaced);
});

test('ordinary sibling replacement preserves its semantic blockquote ancestor and required metadata', async ({ page }) => {
  const html = '<blockquote data-mw-node="test:callout" data-tone="note"><p>Alpha</p><h2>Beta</h2></blockquote><p>Keep</p>';
  await initialize(page, html, [{ name: 'test:callout', kind: 'block', tag: 'blockquote', attributes: { 'data-tone': { type: 'enum', values: ['note', 'warning'], required: true } } }]);
  await selectRange(page);
  const ancestor = await page.locator('.mw-content > blockquote').elementHandle();
  await page.keyboard.type('X');
  const replaced = '<blockquote data-mw-node="test:callout" data-tone="note"><p>AlXta</p></blockquote><p>Keep</p>';
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ html: replaced, selection: { index: 3, length: 0 }, changes: 1 });
  expect(await ancestor!.evaluate((element) => element.isConnected && element === window.editor.surface.firstElementChild)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ html, selection: { index: 2, length: 5 }, undo: false });
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('Y');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<blockquote data-mw-node="test:callout" data-tone="note"><p>AlXYta</p></blockquote><p>Keep</p>');
  await expect(page.locator('.mw-content > blockquote')).toHaveAttribute('data-mw-node', 'test:callout');
  await expect(page.locator('.mw-content > blockquote')).toHaveAttribute('data-tone', 'note');
});

test('replacement inserts its payload inside the starting link and next native link-end input exits before the suffix', async ({ page }) => {
  const html = '<p><a href="https://example.com/start">Alpha</a></p><h2><em>Beta</em></h2><p>Keep</p>';
  await initialize(page, html);
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('a')!.firstChild!, 2, root.querySelector('h2 em')!.firstChild!, 2);
  });
  await page.keyboard.type('X');
  const replaced = '<p><a href="https://example.com/start">AlX</a><em>ta</em></p><p>Keep</p>';
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ html: replaced, selection: { index: 3, length: 0 }, changes: 1 });
  expect(await page.evaluate(() => document.getSelection()!.anchorNode === window.editor.surface.querySelector('a')!.firstChild)).toBe(true);
  await page.keyboard.type('Y');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p><a href="https://example.com/start">AlX</a>Y<em>ta</em></p><p>Keep</p>');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const suffix = root.querySelector('em')!;
    const inserted = suffix.previousSibling!;
    return {
      selection: window.editor.getSelection(),
      outsideLinkBeforeSuffix: inserted.nodeType === 3 && inserted.textContent === 'Y' && inserted.parentNode === root.firstElementChild,
    };
  })).toEqual({ selection: { index: 4, length: 0 }, outsideLinkBeforeSuffix: true });
  await expect(page.locator('.mw-content a')).toHaveText('AlX');
  await expect(page.locator('.mw-content em')).toHaveText('ta');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual({ html: replaced, selection: { index: 3, length: 0 } });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ html, selection: { index: 2, length: 5 }, undo: false });
});
