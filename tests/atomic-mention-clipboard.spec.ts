import { expect, test } from '@playwright/test';
import { atomBoundary, atomicContent, atomicHTML, atomicMentionHTML, atomicSpan, initializeAtomicMention, readAtomicSelection, secondAtomicMentionHTML } from './atomic-mentions.fixture.js';
import { copyClipboardAtom, dispatchMentionClipboard, selectClipboardAtom } from './atomic-mention-clipboard.fixture.js';
import './atomic-mention-clipboard.types.js';

test('copy expands partial backward token endpoints privately and serializes marks without changing selection, focus or history', async ({ page }) => {
  const original = `<p>A <strong>${atomicMentionHTML}</strong> Z</p>`;
  await initializeAtomicMention(page, original);
  const result = await page.evaluate(() => {
    const atom = window.editor.surface.querySelector('[data-mention-id]')!;
    const text = atom.firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(text, 4, text, 1);
    const active = document.activeElement;
    const copied = window.atomicMentionModule.mentionClipboardCommands(window.editor).copy();
    return {
      copied, untouched: native.anchorNode === text && native.anchorOffset === 4 && native.focusNode === text && native.focusOffset === 1,
      focus: document.activeElement === active, html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length,
    };
  });
  expect(result).toEqual({ copied: { html: `<strong>${atomicMentionHTML}</strong>`, text: '@Anna' }, untouched: true, focus: true, html: original, undo: false, changes: 0 });
  await selectClipboardAtom(page);
  expect(await dispatchMentionClipboard(page, 'copy')).toEqual({ prevented: true, html: `<strong>${atomicMentionHTML}</strong>`, text: '@Anna' });
  expect(await atomicHTML(page)).toBe(original);
});

test('native cut writes both formats before deletion, preserves unrelated formats and commits one undoable edit', async ({ page }) => {
  const original = `<p>A ${atomicMentionHTML} Z</p>`;
  await initializeAtomicMention(page, original);
  await selectClipboardAtom(page, 0, true);
  const result = await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('application/x-app-owned', 'keep');
    const write = clipboardData.setData.bind(clipboardData);
    const sourcePresent: boolean[] = [];
    clipboardData.setData = (type, value) => {
      sourcePresent.push(Boolean(window.editor.surface.querySelector('[data-mention-id]')));
      write(type, value);
    };
    const event = new ClipboardEvent('cut', { clipboardData, bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(event);
    return { sourcePresent, html: clipboardData.getData('text/html'), text: clipboardData.getData('text/plain'), app: clipboardData.getData('application/x-app-owned'), prevented: event.defaultPrevented, changes: window.changes.filter((change) => change.source === 'user').length };
  });
  expect(result).toEqual({ sourcePresent: [true, true], html: atomicMentionHTML, text: '@Anna', app: 'keep', prevented: true, changes: 1 });
  expect(await atomicHTML(page)).toBe('<p>A  Z</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await readAtomicSelection(page)).toMatchObject({ text: '@Anna', backward: true });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await atomicHTML(page)).toBe('<p>A  Z</p>');
});

test('failed clipboard writes and callback-time replacement never remove current content or add history', async ({ page }) => {
  await initializeAtomicMention(page);
  const original = await atomicHTML(page);
  await selectClipboardAtom(page);
  const failed = await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    const write = clipboardData.setData.bind(clipboardData);
    let calls = 0;
    clipboardData.setData = (type, value) => {
      calls += 1;
      if (calls === 2) throw new Error('Clipboard unavailable');
      write(type, value);
    };
    const event = new ClipboardEvent('cut', { clipboardData, bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(event);
    // A later browser deletion intent must not bypass the failed transport transaction.
    window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteByCut', bubbles: true, cancelable: true }));
    return { calls, prevented: event.defaultPrevented, html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length };
  });
  expect(failed).toEqual({ calls: 2, prevented: true, html: original, undo: false, changes: 0 });
  await selectClipboardAtom(page);
  const raced = await page.evaluate(() => {
    const surface = window.editor.surface;
    const previous = surface.querySelector('[data-mention-id]')!;
    const clipboardData = new DataTransfer();
    const write = clipboardData.setData.bind(clipboardData);
    let calls = 0;
    clipboardData.setData = (type, value) => {
      write(type, value);
      if (++calls === 2) {
        // Equal serialized content must not make a detached captured node authoritative.
        surface.innerHTML = surface.innerHTML;
        window.editor.setSelection(0);
      }
    };
    surface.dispatchEvent(new ClipboardEvent('cut', { clipboardData, bubbles: true, cancelable: true }));
    return { replaced: previous !== surface.querySelector('[data-mention-id]'), html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length };
  });
  expect(raced).toEqual({ replaced: true, html: original, undo: false, changes: 0 });
  await selectClipboardAtom(page);
  const readRace = await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<span data-mw-node="morfira:mention" data-mention-id="incoming">@Incoming</span>');
    clipboardData.setData('text/plain', '@Incoming');
    const read = clipboardData.getData.bind(clipboardData);
    let called = false;
    clipboardData.getData = (type) => {
      if (type === 'text/plain') {
        called = true;
        window.editor.setHTML('<p>Replacement during clipboard read</p>');
        window.editor.setSelection(3);
      }
      return read(type);
    };
    window.editor.surface.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    return { called, html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.filter((change) => change.source === 'user').length };
  });
  expect(readRace).toEqual({ called: true, html: '<p>Replacement during clipboard read</p>', undo: false, changes: 0 });
});

test('paste preserves IDs at a caret and over selected tokens, leaves typing outside identity and restores one-step history', async ({ page }) => {
  await initializeAtomicMention(page);
  await selectClipboardAtom(page);
  const copied = (await copyClipboardAtom(page))!;
  await page.evaluate(() => window.editor.setHTML('<p>Before  after</p>'));
  await page.evaluate(() => window.editor.setSelection(7));
  expect(await dispatchMentionClipboard(page, 'paste', copied)).toMatchObject({ prevented: true });
  const pasted = await atomicHTML(page);
  expect(pasted).toBe(`<p>Before ${atomicMentionHTML} after</p>`);
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([{ id: 'person-42', text: '@Anna' }]);
  expect(await readAtomicSelection(page)).toMatchObject({ inside: false, logical: { index: 12, length: 0 } });
  await page.keyboard.insertText('!');
  await expect(atomicSpan(page)).toHaveText('@Anna');
  await expect(atomicContent(page)).toHaveText('Before @Anna! after');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(pasted);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe('<p>Before  after</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.setHTML(`<p>A ${'<span data-mw-node="morfira:mention" data-mention-id="person-7">@Bob</span>'} Z</p>`));
  await selectClipboardAtom(page);
  expect(await page.evaluate((data) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste(data), copied)).toBe(true);
  expect(await atomicHTML(page)).toBe(`<p>A ${atomicMentionHTML} Z</p>`);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([{ id: 'person-7', text: '@Bob' }]);
});

test('plain text never reconstructs identity and final-token programmatic cut leaves an editable empty flow', async ({ page }) => {
  await initializeAtomicMention(page, `<p>${atomicMentionHTML}</p>`);
  await selectClipboardAtom(page);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).cut())).toEqual({ html: atomicMentionHTML, text: '@Anna' });
  await expect(atomicContent(page).locator('p > br')).toHaveCount(1);
  await page.keyboard.insertText('Ready');
  await expect(atomicContent(page)).toHaveText('Ready');
  await page.evaluate(() => window.editor.setHTML(`<p>${atomicMentionHTML}</p>`));
  await selectClipboardAtom(page);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: '@Anna\nnext <b>literal</b>' }))).toBe(true);
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([]);
  expect(await atomicHTML(page)).toBe('<p>@Anna<br>next &lt;b&gt;literal&lt;/b&gt;</p>');
});

test('invalid or structural HTML refuses atomically without falling back to text, and safe HTML strips transient attributes', async ({ page }) => {
  await initializeAtomicMention(page);
  await atomBoundary(page, 'before');
  const original = await atomicHTML(page);
  const rejected = await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    const payloads = [
      { html: '<span data-mw-node="morfira:mention" data-mention-id="">@Anna</span>', text: 'fallback' },
      { html: '<span data-mw-node="morfira:mention" data-mention-id="id"><strong>@Anna</strong></span>', text: 'fallback' },
      { html: 'mixed inline<p>Block</p>', text: 'fallback' },
      { html: '<p>First</p>\u00a0<h2>Second</h2>', text: 'fallback' },
      { html: '<table><tr><td>Cell</td></tr></table>', text: 'fallback' },
      { html: '<img src="https://example.invalid/never-load.png">', text: 'fallback' },
      { text: 'x'.repeat(5_000_001) },
      { text: 'x\n'.repeat(50_001) },
      { text: 'safe', unexpected: true },
    ];
    return payloads.map((payload) => {
      try { return api.paste(payload) === false; }
      catch { return true; }
    });
  });
  expect(rejected).toEqual(Array(9).fill(true));
  expect(await atomicHTML(page)).toBe(original);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ undo: false, changes: 0 });
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: '<p><span data-mw-node="morfira:mention" data-mention-id="safe&amp;opaque" contenteditable="true" class="foreign" onclick="alert(1)">@Safe &lt;label&gt;</span></p>', text: 'ignored' }))).toBe(true);
  const html = await atomicHTML(page);
  expect(html).toContain('data-mention-id="safe&amp;opaque"');
  expect(html).not.toMatch(/contenteditable|foreign|onclick|ignored/);
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor)[0])).toEqual({ id: 'safe&opaque', text: '@Safe <label>' });
});

test('same-flow paste in a merged cell preserves actual cells while cross-container atom selections refuse', async ({ page }) => {
  await initializeAtomicMention(page, `<table><tr><td rowspan="2"><p>${atomicMentionHTML}</p></td><td>A</td></tr><tr><td>B</td></tr></table><p>End</p>`, { tables: true });
  const cell = await atomicContent(page).locator('td').first().elementHandle();
  await selectClipboardAtom(page);
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html }), secondAtomicMentionHTML)).toBe(true);
  expect(await cell!.evaluate((node) => node === window.editor.surface.querySelector('td'))).toBe(true);
  await expect(atomicContent(page).locator('td')).toHaveCount(3);
  await expect(atomicContent(page).locator('td').first()).toHaveAttribute('rowspan', '2');
  await expect(atomicContent(page).locator('tr').last().locator('td')).toHaveText('B');
  await selectClipboardAtom(page);
  const gridOwned = await page.evaluate((html) => {
    // Fixture installs mentions before tables; explicit grid ownership still wins.
    window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const mentionAPI = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    const apiRefused = mentionAPI.copy() === undefined && mentionAPI.paste({ text: 'must not replace inline selection' }) === false;
    const copied = new DataTransfer();
    const copy = new ClipboardEvent('copy', { clipboardData: copied, bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(copy);
    const incoming = new DataTransfer();
    incoming.setData('text/html', html);
    incoming.setData('text/plain', '@Anna');
    const paste = new ClipboardEvent('paste', { clipboardData: incoming, bubbles: true, cancelable: true });
    window.editor.surface.dispatchEvent(paste);
    return {
      apiRefused, copyPrevented: copy.defaultPrevented, html: copied.getData('text/html'),
      pastePrevented: paste.defaultPrevented, references: window.atomicMentionModule.getMentions(window.editor),
      cells: window.editor.surface.querySelectorAll('td').length,
      rowspan: window.editor.surface.querySelector('td')!.getAttribute('rowspan'),
    };
  }, atomicMentionHTML);
  expect(gridOwned).toMatchObject({ apiRefused: true, copyPrevented: true, html: expect.stringContaining('<table>'), pastePrevented: true, cells: 3, rowspan: '2' });
  expect(gridOwned.references).toEqual(Array(3).fill({ id: 'person-42', text: '@Anna' }));
  await page.evaluate(() => window.editor.setHTML('<blockquote><p><span data-mw-node="morfira:mention" data-mention-id="a">@A</span></p></blockquote><blockquote><p><span data-mw-node="morfira:mention" data-mention-id="b">@B</span></p></blockquote>'));
  const refused = await page.evaluate(() => {
    const spans = window.editor.surface.querySelectorAll('[data-mention-id]');
    document.getSelection()!.setBaseAndExtent(spans[0].firstChild!, 1, spans[1].firstChild!, 1);
    const before = window.editor.getHTML();
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    let copyRefused = false;
    try { copyRefused = api.copy() === undefined; } catch { copyRefused = true; }
    let pasteRefused = false;
    try { pasteRefused = !api.paste({ text: 'replacement' }); } catch { pasteRefused = true; }
    return { copyRefused, pasteRefused, unchanged: before === window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(refused).toEqual({ copyRefused: true, pasteRefused: true, unchanged: true, undo: false });
});

test('readonly and composition block mutation, focus-time replacement invalidates paste and disposed APIs cannot edit another instance', async ({ page }) => {
  await initializeAtomicMention(page);
  await selectClipboardAtom(page);
  expect(await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    window.editor.setReadOnly(true);
    return { copied: api.copy()?.text, cut: api.cut(), pasted: api.paste({ text: 'blocked' }) };
  })).toEqual({ copied: '@Anna', cut: undefined, pasted: false });
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: 'blocked' }))).toBe(false);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.evaluate(() => {
    window.editor.setHTML('<p>Before after</p>');
    window.editor.setSelection(7);
  });
  const movedWithinText = await page.evaluate(() => {
    const surface = window.editor.surface;
    const text = surface.querySelector('p')!.firstChild!;
    const focus = surface.focus.bind(surface);
    surface.focus = (options) => {
      surface.focus = focus;
      focus(options);
      document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    };
    try {
      return { pasted: window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: 'stale' }), html: window.editor.getHTML(), offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() };
    }
    finally { surface.focus = focus; }
  });
  expect(movedWithinText).toEqual({ pasted: false, html: '<p>Before after</p>', offset: 1, undo: false });
  await page.evaluate((html) => window.editor.setHTML(`<p>${html}</p>`), atomicMentionHTML);
  await atomBoundary(page, 'before');
  const race = await page.evaluate(() => {
    const surface = window.editor.surface;
    const focus = surface.focus.bind(surface);
    let called = false;
    surface.focus = (options) => {
      surface.focus = focus;
      focus(options);
      called = true;
      window.editor.setHTML('<p>Replacement</p>');
    };
    try {
      const pasted = window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: 'stale' });
      return { called, pasted, html: window.editor.getHTML(), undo: window.editor.canUndo() };
    }
    finally { surface.focus = focus; }
  });
  expect(race).toEqual({ called: true, pasted: false, html: '<p>Replacement</p>', undo: false });
  const isolated = await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    window.editor.destroy();
    const host = document.createElement('div');
    document.body.append(host);
    const other = window.createEditor(host, { value: '<p>Independent</p>', plugins: [window.atomicMentionModule.mentions({ persistent: true, atomic: true, provide: () => [] })] });
    other.focus();
    other.setSelection(0);
    let refused = false;
    try { refused = !api.paste({ text: 'stale' }); } catch { refused = true; }
    const html = other.getHTML();
    other.destroy(); host.remove();
    return { refused, html };
  });
  expect(isolated).toEqual({ refused: true, html: '<p>Independent</p>' });
});

test('prehandled and uncancelable events are observational for the mention owner and nonatomic mode has no clipboard API', async ({ page }) => {
  await initializeAtomicMention(page);
  await selectClipboardAtom(page);
  const original = await atomicHTML(page);
  const results = await page.evaluate(() => {
    const results: string[] = [];
    for (const kind of ['cut', 'paste'] as const) {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', '<span data-mw-node="morfira:mention" data-mention-id="b">@B</span>');
      const canceled = new ClipboardEvent(kind, { clipboardData, bubbles: true, cancelable: true });
      canceled.preventDefault();
      window.editor.surface.dispatchEvent(canceled);
      results.push(window.editor.getHTML());
      // Cut has no core paste owner. For paste, prevent propagation to core to isolate the owner contract.
      const stop = (event: Event) => { if (!event.cancelable) event.stopImmediatePropagation(); };
      window.editor.surface.addEventListener(kind, stop, true);
      try { window.editor.surface.dispatchEvent(new ClipboardEvent(kind, { clipboardData, bubbles: true, cancelable: false })); }
      finally { window.editor.surface.removeEventListener(kind, stop, true); }
      results.push(window.editor.getHTML());
    }
    return results;
  });
  expect(results).toEqual(Array(4).fill(original));
  const fileEvent = await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<span data-mw-node="morfira:mention" data-mention-id="b">@B</span>');
    clipboardData.items.add(new File(['image'], 'image.png', { type: 'image/png' }));
    let owned = false;
    const laterOwner = (event: Event) => {
      owned = event.defaultPrevented;
      event.stopImmediatePropagation();
    };
    window.editor.surface.addEventListener('paste', laterOwner, true);
    try { window.editor.surface.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })); }
    finally { window.editor.surface.removeEventListener('paste', laterOwner, true); }
    return { owned, html: window.editor.getHTML() };
  });
  expect(fileEvent).toEqual({ owned: false, html: original });
  await initializeAtomicMention(page, undefined, { atomic: false });
  expect(await page.evaluate(() => {
    try { window.atomicMentionModule.mentionClipboardCommands(window.editor); return false; }
    catch { return true; }
  })).toBe(true);
});
