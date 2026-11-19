import { expect, test } from '@playwright/test';
import { initializeSearchHighlights, nativeSearchHighlights, setHighlightQuery } from './search-highlights.fixture.js';
import './search-highlights.types.js';

test('observational search ranges preserve rich/cell targets, semantic boundaries and private range ownership', async ({ page }) => {
  await initializeSearchHighlights(page, '<p>A <strong>Need</strong><em>le</em> B <span data-mw-node="test:identity" data-id="7">Needle</span></p><table><tr><td rowspan="2">Needle</td><td>Need</td></tr><tr><td>le</td></tr></table><p>Tail Needle</p>', { mount: false });
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const api = window.searchHighlightAPI;
    editor.surface.focus();
    const first = editor.surface.querySelector('p')!;
    document.getSelection()!.setBaseAndExtent(first.querySelector('strong')!.firstChild!, 2, first.firstChild!, 0);
    api.setQuery('Needle');
    const before = { html: editor.getHTML(), json: editor.getJSON(), text: editor.getText(), selection: editor.getSelection(), anchor: document.getSelection()!.anchorNode, offset: document.getSelection()!.anchorOffset, focused: document.activeElement, undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    const snapshot = window.searchHighlightsSearchModule.getSearchRanges(editor);
    const targets = snapshot.ranges.map((range) => ({ text: range.toString(), cell: Boolean(range.startContainer.parentElement?.closest('td')), semantic: Boolean(range.commonAncestorContainer.parentElement?.closest('[data-mw-node]')) }));
    snapshot.ranges[0].collapse(true);
    const fresh = window.searchHighlightsSearchModule.getSearchRanges(editor);
    const unchanged = before.html === editor.getHTML() && JSON.stringify(before.json) === JSON.stringify(editor.getJSON())
      && before.text === editor.getText() && JSON.stringify(before.selection) === JSON.stringify(editor.getSelection())
      && before.anchor === document.getSelection()!.anchorNode && before.offset === document.getSelection()!.anchorOffset
      && before.focused === document.activeElement && before.undo === editor.canUndo() && before.redo === editor.canRedo() && before.changes === window.changes.length;
    return { targets, current: snapshot.current, fresh: fresh.ranges[0].toString(), independent: fresh.ranges[0] !== snapshot.ranges[0], unchanged };
  });
  expect(result).toEqual({ targets: [{ text: 'Needle', cell: false, semantic: false }, { text: 'Needle', cell: true, semantic: false }, { text: 'Needle', cell: false, semantic: false }], current: 0, fresh: 'Needle', independent: true, unchanged: true });
});

test('native all/current paint ranges leave content, focus, selection and history unchanged', async ({ page }) => {
  await initializeSearchHighlights(page);
  test.skip(!await page.evaluate(() => window.searchHighlightsNative), 'Native paint is unavailable; the unsupported contract has a separate regression.');
  const before = await page.evaluate(() => ({ html: window.editor.getHTML(), json: window.editor.getJSON(), selection: window.editor.getSelection(), focused: document.activeElement === window.editor.surface, changes: window.changes.length }));
  await setHighlightQuery(page, 'one');
  expect(await nativeSearchHighlights(page)).toEqual({ all: ['one', 'one', 'ONE'], current: ['one'], priority: 1, connected: true });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), json: window.editor.getJSON(), selection: window.editor.getSelection(), focused: document.activeElement === window.editor.surface, changes: window.changes.length }))).toEqual(before);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), redo: window.editor.canRedo(), wrappers: window.editor.surface.querySelectorAll('mark,[data-search-highlight]').length }))).toEqual({ undo: false, redo: false, wrappers: 0 });
  await page.evaluate(() => window.searchHighlightAPI.select(2));
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().current)).toBe(2);
  expect((await nativeSearchHighlights(page)).current).toEqual(['ONE']);
  expect(await page.evaluate(() => ({ selected: document.getSelection()?.toString(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ selected: 'ONE', undo: false, changes: 0 });
  await page.evaluate(() => window.searchHighlightAPI.clear());
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(0);
  expect((await nativeSearchHighlights(page)).all).toEqual([]);
});

test('highlights refresh after options, replacement/history and identical-HTML node reconstruction', async ({ page }) => {
  await initializeSearchHighlights(page);
  test.skip(!await page.evaluate(() => window.searchHighlightsNative), 'Native paint is unavailable; the unsupported contract has a separate regression.');
  await setHighlightQuery(page, 'one');
  await page.evaluate(() => window.searchHighlightAPI.setQuery('one', { caseSensitive: true }));
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(2);
  await page.evaluate(() => window.searchHighlightAPI.replaceAll('two'));
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(0);
  await page.evaluate(() => window.editor.undo());
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(2);
  await page.evaluate(() => window.editor.redo());
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(0);
  await page.evaluate(() => window.editor.setHTML('<p>one one</p>'));
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(2);
  const rebuilt = await page.evaluate(() => {
    const surface = window.editor.surface;
    const old = surface.firstElementChild!.firstChild!;
    surface.innerHTML = surface.innerHTML;
    const fresh = window.searchHighlightsSearchModule.getSearchRanges(window.editor);
    window.searchHighlighter.refresh();
    return { removed: !surface.contains(old), texts: fresh.ranges.map((range) => range.toString()), allConnected: fresh.ranges.every((range) => surface.contains(range.startContainer)) };
  });
  expect(rebuilt).toEqual({ removed: true, texts: ['one', 'one'], allConnected: true });
  await expect.poll(async () => (await nativeSearchHighlights(page)).connected).toBe(true);
  // Attribute-only ownership changes do not emit an editor value notification.
  await page.evaluate(() => window.editor.surface.querySelector('p')!.setAttribute('data-mw-node', 'test:opaque'));
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(0);
  await page.evaluate(() => window.editor.setHTML('<p>' + 'one '.repeat(10001) + '</p>'));
  await expect.poll(() => page.evaluate(() => window.searchHighlightAPI.getState().error)).toBe('match-limit');
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(0);
  expect((await nativeSearchHighlights(page)).all).toEqual([]);
});

test('readonly remains paintable and composition/API replacement clear stale ranges without adding edits', async ({ page }) => {
  await initializeSearchHighlights(page);
  test.skip(!await page.evaluate(() => window.searchHighlightsNative), 'Native paint is unavailable; the unsupported contract has a separate regression.');
  await setHighlightQuery(page, 'one');
  await page.evaluate(() => window.editor.setReadOnly(true));
  expect(await page.evaluate(() => window.searchHighlighter.getState())).toEqual({ status: 'ready', count: 3, current: 0 });
  await page.evaluate(() => window.editor.setReadOnly(false));
  const immediate = await page.evaluate(() => {
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    return CSS.highlights.get('morfira-search-results')?.size ?? 0;
  });
  expect(immediate).toBe(0);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(3);
  const cleared = await page.evaluate(() => {
    window.editor.setHTML('<p>one replacement</p>');
    return CSS.highlights.get('morfira-search-results')?.size ?? 0;
  });
  expect(cleared).toBe(0);
  await expect.poll(() => page.evaluate(() => window.searchHighlighter.getState().count)).toBe(1);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), userChanges: window.changes.filter((change) => change.source === 'user').length }))).toEqual({ html: '<p>one replacement</p>', undo: false, userChanges: 0 });
});

test('unsupported native APIs preserve search and malformed options fail without document mutation', async ({ page }) => {
  await initializeSearchHighlights(page, '<p>one one</p>', { mount: false });
  const result = await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'Highlight');
    const before = window.editor.getHTML();
    Object.defineProperty(window, 'Highlight', { value: undefined, configurable: true, writable: true });
    try {
      const controller = window.searchHighlightsModule.createSearchHighlights(window.editor);
      const state = controller.getState();
      window.searchHighlightAPI.setQuery('one');
      window.searchHighlightAPI.next();
      const selected = document.getSelection()?.toString();
      controller.destroy();
      controller.destroy();
      const rejected: boolean[] = [];
      for (const options of [{ onError: 'bad' }, { unknown: true }]) {
        try { window.searchHighlightsModule.createSearchHighlights(window.editor, options as never); rejected.push(false); }
        catch { rejected.push(true); }
      }
      for (const action of [() => controller.refresh(), () => controller.getState()]) {
        try { action(); rejected.push(false); } catch { rejected.push(true); }
      }
      const host = document.createElement('div');
      document.body.append(host);
      const plain = window.createEditor(host, { value: '<p>Unrelated editor</p>' });
      try {
        try { window.searchHighlightsModule.createSearchHighlights(plain); rejected.push(false); }
        catch { rejected.push(true); }
      }
      finally { plain.destroy(); host.remove(); }
      return { state, selected, rejected, same: before === window.editor.getHTML(), undo: window.editor.canUndo() };
    }
    finally {
      if (descriptor) Object.defineProperty(window, 'Highlight', descriptor);
      else Reflect.deleteProperty(window, 'Highlight');
    }
  });
  expect(result).toEqual({ state: { status: 'unsupported', count: 0, current: -1 }, selected: 'one', rejected: [true, true, true, true, true], same: true, undo: false });
});

test('foreign registry entries are preserved before setup and after owned-key replacement', async ({ page }) => {
  await initializeSearchHighlights(page, '<p>one one</p>', { mount: false });
  test.skip(!await page.evaluate(() => window.searchHighlightsNative), 'Native registry ownership cannot be exercised without the native API.');
  expect(await page.evaluate(() => {
    const foreign = new Highlight();
    const unrelated = new Highlight();
    CSS.highlights.set('morfira-search-results', foreign);
    CSS.highlights.set('app-search-owned', unrelated);
    const failed = window.searchHighlightsModule.createSearchHighlights(window.editor);
    const first = failed.getState();
    failed.destroy();
    const preserved = CSS.highlights.get('morfira-search-results') === foreign && CSS.highlights.get('app-search-owned') === unrelated;
    CSS.highlights.delete('morfira-search-results');
    window.searchHighlighter = window.searchHighlightsModule.createSearchHighlights(window.editor);
    window.searchHighlightAPI.setQuery('one');
    window.searchHighlighter.refresh();
    const replacement = new Highlight();
    CSS.highlights.set('morfira-search-results', replacement);
    window.searchHighlighter.refresh();
    const second = window.searchHighlighter.getState();
    window.searchHighlighter.destroy();
    const retained = CSS.highlights.get('morfira-search-results') === replacement && CSS.highlights.get('app-search-owned') === unrelated;
    CSS.highlights.delete('morfira-search-results');
    CSS.highlights.delete('app-search-owned');
    return { first, preserved, second, retained, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ first: { status: 'conflict', count: 0, current: -1 }, preserved: true, second: { status: 'conflict', count: 0, current: -1 }, retained: true, html: '<p>one one</p>', undo: false });
});

test('multiple editors retain only their own ranges and disposal cancels pending refreshes', async ({ page }) => {
  await initializeSearchHighlights(page, '<p>one one</p>');
  test.skip(!await page.evaluate(() => window.searchHighlightsNative), 'Native registry ownership cannot be exercised without the native API.');
  await setHighlightQuery(page, 'one');
  await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.append(host);
    window.secondSearchHighlightEditor = window.createEditor(host, { value: '<p>two two two</p>', plugins: [window.searchHighlightsSearchModule.search()] });
    window.secondSearchHighlightAPI = window.searchHighlightsSearchModule.searchCommands(window.secondSearchHighlightEditor);
    window.secondSearchHighlighter = window.searchHighlightsModule.createSearchHighlights(window.secondSearchHighlightEditor);
    window.secondSearchHighlightAPI.setQuery('two');
  });
  await expect.poll(() => page.evaluate(() => CSS.highlights.get('morfira-search-results')?.size)).toBe(5);
  expect(await page.evaluate(() => {
    let duplicate = false;
    try { window.searchHighlightsModule.createSearchHighlights(window.editor); } catch { duplicate = true; }
    window.searchHighlightAPI.setQuery('nothing');
    window.searchHighlighter.destroy();
    window.searchHighlighter.destroy();
    const group = CSS.highlights.get('morfira-search-results')!;
    return { duplicate, count: group.size, texts: [...group.values()].map((range) => (range as Range).toString()), current: CSS.highlights.get('morfira-search-current')!.size };
  })).toEqual({ duplicate: true, count: 3, texts: ['two', 'two', 'two'], current: 1 });
  // A queued frame cannot repopulate ranges after this controller/editor teardown.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => CSS.highlights.get('morfira-search-results')?.size)).toBe(3);
  await page.evaluate(() => window.secondSearchHighlightEditor.destroy());
  expect(await page.evaluate(() => ({ all: CSS.highlights.has('morfira-search-results'), current: CSS.highlights.has('morfira-search-current'), html: window.editor.getHTML() }))).toEqual({ all: false, current: false, html: '<p>one one</p>' });
});
