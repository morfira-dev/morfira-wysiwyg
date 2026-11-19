import { expect, test } from '@playwright/test';
import { atomBoundary, atomicContent, atomicHTML, atomicMentionHTML, atomicSpan, initializeAtomicMention, readAtomicSelection, secondAtomicMentionHTML } from './atomic-mentions.fixture.js';
import './atomic-mentions.types.js';

test('atomic rendering is opt-in and transient across HTML/JSON replacement without a persisted format change', async ({ page }) => {
  const original = `<p>A ${atomicMentionHTML} Z</p>`;
  await initializeAtomicMention(page, original);
  await expect(atomicSpan(page)).toHaveAttribute('contenteditable', 'false');
  expect(await page.evaluate(() => ({
    html: window.editor.getHTML(), json: JSON.stringify(window.editor.getJSON()),
    references: window.atomicMentionModule.getMentions(window.editor),
    undo: window.editor.canUndo(), changes: window.changes.length,
  }))).toEqual({ html: original, json: expect.not.stringContaining('contenteditable'), references: [{ id: 'person-42', text: '@Anna' }], undo: false, changes: 0 });
  await page.evaluate(() => {
    const value = window.editor.getJSON();
    window.editor.setHTML('<p>Other</p>');
    window.editor.setJSON(value);
  });
  await expect(atomicSpan(page)).toHaveAttribute('contenteditable', 'false');
  expect(await atomicHTML(page)).toBe(original);
  await initializeAtomicMention(page, original, { atomic: false });
  await expect(atomicSpan(page)).not.toHaveAttribute('contenteditable', 'false');
  expect(await atomicHTML(page)).toBe(original);
  expect(await page.evaluate(() => {
    const rejected: boolean[] = [];
    for (const options of [
      { atomic: true, persistent: false, provide: () => [] },
      { atomic: 'true', persistent: true, provide: () => [] },
    ]) {
      try { window.atomicMentionModule.mentions(options as never); rejected.push(false); }
      catch (error) { rejected.push(error instanceof TypeError); }
    }
    return rejected;
  })).toEqual([true, true]);
});

test('horizontal and Shift navigation skips the entire mention while API interior ranges snap out with direction intact', async ({ page }) => {
  await initializeAtomicMention(page);
  await atomBoundary(page, 'before');
  await page.keyboard.press('ArrowRight');
  expect(await readAtomicSelection(page)).toMatchObject({ logical: { index: 7, length: 0 }, inside: false });
  await page.keyboard.press('ArrowLeft');
  expect(await readAtomicSelection(page)).toMatchObject({ logical: { index: 2, length: 0 }, inside: false });
  await page.keyboard.press('Shift+ArrowRight');
  expect(await readAtomicSelection(page)).toMatchObject({ logical: { index: 2, length: 5 }, text: '@Anna', inside: false, backward: false });
  await atomBoundary(page, 'after');
  await page.keyboard.press('Shift+ArrowLeft');
  expect(await readAtomicSelection(page)).toMatchObject({ logical: { index: 2, length: 5 }, text: '@Anna', inside: false, backward: true });
  await page.evaluate(() => window.editor.setSelection(3));
  await expect.poll(() => readAtomicSelection(page)).toMatchObject({ logical: { index: 2, length: 0 }, inside: false });
  await page.evaluate(() => window.editor.setSelection(6));
  await expect.poll(() => readAtomicSelection(page)).toMatchObject({ logical: { index: 7, length: 0 }, inside: false });
  await atomicSpan(page).evaluate((span) => {
    const text = span.firstChild!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(text, 4, text, 1);
  });
  await expect.poll(() => readAtomicSelection(page)).toMatchObject({ logical: { index: 2, length: 5 }, text: '@Anna', inside: false, backward: true });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ html: `<p>A ${atomicMentionHTML} Z</p>`, undo: false, changes: 0 });
});

test('ordinary RTL navigation reverses logical arrows and pointer activation selects the complete reference', async ({ page }) => {
  await initializeAtomicMention(page, `<p dir="rtl">A ${atomicMentionHTML} Z</p>`);
  await atomBoundary(page, 'before');
  await page.keyboard.press('ArrowLeft');
  expect(await readAtomicSelection(page)).toMatchObject({ logical: { index: 7, length: 0 }, inside: false });
  await page.keyboard.press('Shift+ArrowRight');
  expect(await readAtomicSelection(page)).toMatchObject({ logical: { index: 2, length: 5 }, text: '@Anna', inside: false, backward: true });
  await atomicSpan(page).click();
  await expect.poll(() => readAtomicSelection(page)).toMatchObject({ logical: { index: 2, length: 5 }, text: '@Anna', inside: false });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('Backspace removes one whole mention, restores it with one Undo, and subsequent text is outside identity', async ({ page }) => {
  const original = `<p>A ${atomicMentionHTML} Z</p>`;
  await initializeAtomicMention(page, original);
  await atomBoundary(page, 'after');
  await page.keyboard.press('Backspace');
  await expect(atomicSpan(page)).toHaveCount(0);
  expect(await atomicHTML(page)).toBe('<p>A  Z</p>');
  expect(await page.evaluate(() => ({ references: window.atomicMentionModule.getMentions(window.editor), changes: window.changes.filter((change) => change.source === 'user').length }))).toEqual({ references: [], changes: 1 });
  await page.keyboard.insertText('X');
  await expect(atomicContent(page)).toHaveText('A X Z');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe('<p>A  Z</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  await expect(atomicSpan(page)).toHaveAttribute('contenteditable', 'false');
  expect(await readAtomicSelection(page)).toMatchObject({ logical: { index: 7, length: 0 }, inside: false });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await atomicHTML(page)).toBe('<p>A  Z</p>');
});

test('Delete preserves an adjacent reference and the separate insertion space is ordinary deletable text', async ({ page }) => {
  await initializeAtomicMention(page, `<p>${atomicMentionHTML}${secondAtomicMentionHTML}</p>`);
  await atomBoundary(page, 'before');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([{ id: 'person-7', text: '@Bob' }]);
  await atomBoundary(page, 'before');
  await page.keyboard.press('Delete');
  await expect(atomicSpan(page)).toHaveCount(0);
  await expect(atomicContent(page).locator('p > br')).toHaveCount(1);
  await page.keyboard.insertText('Ready');
  await expect(atomicContent(page)).toHaveText('Ready');
  await initializeAtomicMention(page, '<p>@a</p>');
  expect(await page.evaluate(() => window.atomicMentionModule.mentionCommands(window.editor).open())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.atomicMentionModule.mentionCommands(window.editor).getState().status)).toBe('ready');
  await page.evaluate(() => window.atomicMentionModule.mentionCommands(window.editor).choose('person-42'));
  await expect(atomicSpan(page)).toHaveAttribute('contenteditable', 'false');
  await page.keyboard.press('Backspace');
  expect(await atomicHTML(page)).toBe(`<p>${atomicMentionHTML}</p>`);
  await page.keyboard.press('Backspace');
  await expect(atomicSpan(page)).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(`<p>${atomicMentionHTML}</p>`);
  await expect(atomicSpan(page)).toHaveAttribute('contenteditable', 'false');
});

test('partial same-flow deletion expands the reference, while cross-block atom edits refuse without changing history', async ({ page }) => {
  const original = `<p>A ${atomicMentionHTML} Z</p>`;
  await initializeAtomicMention(page, original);
  await atomicSpan(page).evaluate((span) => {
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(span.firstChild!, 4, span.firstChild!, 1);
  });
  await expect.poll(() => page.evaluate(() => document.getSelection()!.toString())).toBe('@Anna');
  await page.keyboard.press('Backspace');
  expect(await atomicHTML(page)).toBe('<p>A  Z</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await readAtomicSelection(page)).toMatchObject({ logical: { index: 2, length: 5 }, text: '@Anna', backward: true });
  await initializeAtomicMention(page, `<p>A ${atomicMentionHTML}</p><p>B ${secondAtomicMentionHTML}</p>`);
  const before = await atomicHTML(page);
  await page.evaluate(() => {
    const atoms = window.editor.surface.querySelectorAll('[data-mw-node="morfira:mention"]');
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(atoms[0].firstChild!, 2, atoms[1].firstChild!, 2);
  });
  await page.keyboard.press('Backspace');
  expect(await atomicHTML(page)).toBe(before);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ undo: false, changes: 0 });
});

test('whole-token deletion in a list and merged table cell preserves surrounding structure and actual cells', async ({ page }) => {
  await initializeAtomicMention(page, `<ul><li><p>Item ${atomicMentionHTML}</p><ul><li>Nested</li></ul></li><li>Keep</li></ul>`);
  await atomBoundary(page, 'after');
  await page.keyboard.press('Backspace');
  await expect(atomicContent(page).locator('ul ul li')).toHaveText('Nested');
  await expect(atomicContent(page).locator(':scope > ul > li').last()).toHaveText('Keep');
  await expect(atomicContent(page).locator(':scope > ul > li > p').first()).toHaveText('Item ');
  await page.evaluate(() => window.editor.undo());
  await expect(atomicSpan(page)).toHaveAttribute('contenteditable', 'false');
  await initializeAtomicMention(page, `<table><tr><td rowspan="2"><p>${atomicMentionHTML}</p></td><td>A</td></tr><tr><td>B</td></tr></table><p>After</p>`, { tables: true });
  const original = await atomicHTML(page);
  const cell = await atomicContent(page).locator('td').first().elementHandle();
  await atomBoundary(page, 'before');
  await page.keyboard.press('Delete');
  await expect(atomicContent(page).locator('td')).toHaveCount(3);
  await expect(atomicContent(page).locator('td').first()).toHaveAttribute('rowspan', '2');
  await expect(atomicContent(page).locator('td').first().locator('p > br')).toHaveCount(1);
  expect(await cell!.evaluate((node) => node === window.editor.surface.querySelector('td'))).toBe(true);
  await expect(atomicContent(page).locator('tr').last().locator('td')).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  await expect(atomicSpan(page)).toHaveAttribute('contenteditable', 'false');
});

test('readonly, composition and focus-time replacement cannot delete an old token, and reused plugin instances clean only owned annotations', async ({ page }) => {
  await initializeAtomicMention(page);
  const original = await atomicHTML(page);
  await atomBoundary(page, 'after');
  expect(await page.evaluate(() => {
    const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: false });
    window.editor.surface.dispatchEvent(event);
    return { prevented: event.defaultPrevented, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ prevented: false, html: original, undo: false });
  await page.evaluate(() => window.editor.setReadOnly(true));
  // Readonly contenteditable can blur to body; on macOS WebKit Backspace then
  // means browser history navigation. Target the editor's backward-deletion
  // intent explicitly and keep a native forward-deletion check as well.
  await page.evaluate(() => {
    const surface = window.editor.surface;
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
  });
  await page.keyboard.press('Delete');
  expect(await atomicHTML(page)).toBe(original);
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true, isComposing: true }));
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  expect(await atomicHTML(page)).toBe(original);
  await atomBoundary(page, 'after');
  expect(await page.evaluate(() => {
    const surface = window.editor.surface;
    const focus = surface.focus.bind(surface);
    let called = false;
    surface.focus = (options) => {
      surface.focus = focus;
      focus(options);
      called = true;
      window.editor.setHTML('<p>Replacement</p>');
    };
    try { surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true })); }
    finally { surface.focus = focus; }
    return { called, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ called: true, html: '<p>Replacement</p>', undo: false });
  const reused = await page.evaluate(async ({ first, second }) => {
    const shared = window.atomicMentionModule.mentions({ persistent: true, atomic: true, provide: () => [] });
    const firstHost = document.createElement('div');
    const secondHost = document.createElement('div');
    document.body.append(firstHost, secondHost);
    const a = window.createEditor(firstHost, { value: `<p>${first}</p>`, plugins: [shared] });
    const b = window.createEditor(secondHost, { value: `<p>${second}</p>`, plugins: [shared] });
    const atomA = a.surface.querySelector('span')!;
    const atomB = b.surface.querySelector('span')!;
    try {
      a.destroy();
      await Promise.resolve();
      const independent = atomA.getAttribute('contenteditable') === null && atomB.getAttribute('contenteditable') === 'false';
      atomB.setAttribute('contenteditable', 'plaintext-only');
      b.destroy();
      await Promise.resolve();
      return { independent, foreignValue: atomB.getAttribute('contenteditable'), html: atomA.outerHTML };
    }
    finally { a.destroy(); b.destroy(); firstHost.remove(); secondHost.remove(); }
  }, { first: atomicMentionHTML, second: secondAtomicMentionHTML });
  expect(reused).toEqual({ independent: true, foreignValue: 'plaintext-only', html: atomicMentionHTML });
});

test('atomic text-content schema rejects malformed labels and definitions before HTML/JSON mutation, preserving editable readers', async ({ page }) => {
  await initializeAtomicMention(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const before = { html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), changes: window.changes.length };
    const invalid: boolean[] = [];
    const labels = [[], [{ type: 'text', text: 'x'.repeat(202) }], [{ type: 'text', text: 'a\nb' }], [{ type: 'element', tag: 'strong', attributes: {}, children: [{ type: 'text', text: '@Anna' }] }]];
    for (const children of labels) {
      try {
        editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'span', attributes: { 'data-mw-node': 'morfira:mention', 'data-mention-id': 'id' }, children }] } as never);
        invalid.push(false);
      }
      catch { invalid.push(true); }
    }
    for (const text of ['', 'x'.repeat(202), 'a\nb', '<strong>@Anna</strong>']) {
      try { editor.setHTML(`<p><span data-mw-node="morfira:mention" data-mention-id="id">${text}</span></p>`); invalid.push(false); }
      catch { invalid.push(true); }
    }
    const after = { html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), changes: window.changes.length };
    const malformed: boolean[] = [];
    const definitions = [
      { type: 'html' }, { type: 'text', minLength: 3, maxLength: 2 },
      { type: 'text', singleLine: 'yes' }, { type: 'text', required: true },
    ];
    for (const content of definitions) {
      const host = document.createElement('div');
      document.body.append(host);
      try {
        const created = window.createEditor(host, { schema: [{ name: 'test:content', kind: 'inline', tag: 'span', content }] } as never);
        created.destroy();
        malformed.push(false);
      }
      catch { malformed.push(true); }
      finally { host.remove(); }
    }
    const valid = editor.schema.validateDocument({ version: 1, children: [{ type: 'element', tag: 'span', attributes: { 'data-mw-node': 'morfira:mention', 'data-mention-id': 'id' }, children: [{ type: 'text', text: '@' }, { type: 'text', text: 'Anna' }] }] });
    return { invalid, unchanged: JSON.stringify(before) === JSON.stringify(after), malformed, text: valid.children[0].type === 'element' ? valid.children[0].children.map((node) => node.type === 'text' ? node.text : '').join('') : '' };
  });
  expect(result).toEqual({ invalid: Array(8).fill(true), unchanged: true, malformed: Array(4).fill(true), text: '@Anna' });
  await initializeAtomicMention(page, `<p><span data-mw-node="morfira:mention" data-mention-id="id"><strong>@Anna</strong></span></p>`, { atomic: false });
  await expect(atomicSpan(page).locator('strong')).toHaveText('@Anna');
  await expect(atomicSpan(page)).not.toHaveAttribute('contenteditable', 'false');
});
