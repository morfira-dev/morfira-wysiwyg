import { expect, test } from '@playwright/test';
import { atomicContent, atomicHTML, atomicMentionHTML, initializeAtomicMention, readAtomicSelection, secondAtomicMentionHTML } from './atomic-mentions.fixture.js';
import { dispatchMentionClipboard } from './atomic-mention-clipboard.fixture.js';
import { selectMentionItems } from './atomic-mention-list.fixture.js';

test('copy expands backward partial list references privately and keeps list/item attributes and rich own-body text', async ({ page }) => {
  const original = `<ol start="4"><li title="first">L <strong>${atomicMentionHTML} first</strong></li><li><br></li><li><em>last ${secondAtomicMentionHTML}</em> R</li></ol>`;
  await initializeAtomicMention(page, original);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const first = root.querySelector('[data-mention-id="person-42"]')!.firstChild!;
    const last = root.querySelector('[data-mention-id="person-7"]')!.firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(last, 3, first, 1);
    const active = document.activeElement;
    const data = window.atomicMentionModule.mentionClipboardCommands(window.editor).copy();
    return { data, html: window.editor.getHTML(), focus: document.activeElement === active,
      untouched: native.anchorNode === last && native.anchorOffset === 3 && native.focusNode === first && native.focusOffset === 1,
      undo: window.editor.canUndo(), changes: window.changes.length };
  });
  expect(result).toEqual({
    data: { html: `<ol start="4"><li title="first"><strong>${atomicMentionHTML} first</strong></li><li><br></li><li><em>last ${secondAtomicMentionHTML}</em></li></ol>`, text: '@Anna first\n\nlast @Bob' },
    html: original, focus: true, untouched: true, undo: false, changes: 0,
  });
});

test('multi-body list copy includes selected headings and paragraphs without copying unselected later bodies or branches', async ({ page }) => {
  const original = `<ul><li><p>before</p><h2>L ${atomicMentionHTML} first</h2><p>middle A</p></li><li><p>middle B</p><h3>last ${secondAtomicMentionHTML} R</h3><p>following</p><ul><li>branch</li></ul></li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionItems(page);
  const copied = await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).copy());
  expect(copied).toEqual({
    html: `<ul><li><h2>${atomicMentionHTML} first</h2><p>middle A</p></li><li><p>middle B</p><h3>last ${secondAtomicMentionHTML}</h3></li></ul>`,
    text: '@Anna first\nmiddle A\nmiddle B\nlast @Bob',
  });
  expect(await atomicHTML(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('native item cut joins rich edges and moves actual unselected following bodies and branch under the retained first item', async ({ page }) => {
  const original = `<ul><li title="keep"><strong>L ${atomicMentionHTML}</strong></li><li>middle</li><li><h2>${secondAtomicMentionHTML} <em>R</em></h2><h3>following</h3><ul title="branch"><li>child</li></ul></li><li>outside</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionItems(page, true);
  const root = atomicContent(page);
  const first = await root.locator(':scope > ul > li').first().elementHandle();
  const suffix = await root.locator('em').elementHandle();
  const following = await root.locator('h3').elementHandle();
  const branch = await root.locator('ul[title="branch"]').elementHandle();
  const outside = await root.locator(':scope > ul > li').last().elementHandle();
  expect(await dispatchMentionClipboard(page, 'cut')).toEqual({
    prevented: true,
    html: `<ul><li title="keep"><strong>${atomicMentionHTML}</strong></li><li>middle</li><li><h2>${secondAtomicMentionHTML}</h2></li></ul>`,
    text: '@Anna\nmiddle\n@Bob',
  });
  const cut = '<ul><li title="keep"><p><strong>L </strong> <em>R</em></p><h3>following</h3><ul title="branch"><li>child</li></ul></li><li>outside</li></ul>';
  expect(await atomicHTML(page)).toBe(cut);
  expect(await first!.evaluate((node) => node === window.editor.surface.querySelector('ul > li'))).toBe(true);
  for (const node of [suffix, following, branch, outside]) expect(await node!.evaluate((element) => element.isConnected && window.editor.surface.contains(element))).toBe(true);
  expect(await readAtomicSelection(page)).toMatchObject({ inside: false, logical: { index: 2, length: 0 } });
  expect(await page.evaluate(() => {
    const native = document.getSelection()!;
    const mark = window.editor.surface.querySelector('li > p > strong')!;
    return { retainedStartingMark: native.anchorNode === mark && native.anchorOffset === 1, collapsed: native.isCollapsed };
  })).toEqual({ retainedStartingMark: true, collapsed: true });
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await readAtomicSelection(page)).toMatchObject({ backward: true, inside: false });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await atomicHTML(page)).toBe(cut);
});

test('flat list paste at a caret inserts sibling items while the destination list type and numbering attributes win', async ({ page }) => {
  const original = '<ol start="6"><li title="keep">Left Right</li><li>outside</li></ol>';
  await initializeAtomicMention(page, original);
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('li')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 5, text, 5);
  });
  const data = { html: `<ul><li>${atomicMentionHTML} first</li><li title="incoming"><strong>second ${secondAtomicMentionHTML}</strong></li></ul>`, text: '@Anna first\nsecond @Bob' };
  expect(await dispatchMentionClipboard(page, 'paste', data)).toMatchObject({ prevented: true });
  const pasted = `<ol start="6"><li title="keep">Left ${atomicMentionHTML} first</li><li title="incoming"><strong>second ${secondAtomicMentionHTML}</strong>Right</li><li>outside</li></ol>`;
  expect(await atomicHTML(page)).toBe(pasted);
  await expect(atomicContent(page).locator('li > li')).toHaveCount(0);
  expect(await readAtomicSelection(page)).toMatchObject({ inside: false });
  await page.keyboard.insertText('!');
  await expect(atomicContent(page).locator(':scope > ol > li').nth(1)).toHaveText('second @Bob!Right');
  await expect(atomicContent(page).locator('[data-mention-id="person-7"]')).toHaveText('@Bob');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(pasted);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('list payload and paragraph-heading payload have distinct item composition over the same selected bodies', async ({ page }) => {
  const original = `<ul><li><p title="left">L ${atomicMentionHTML}</p>\n<p>covered</p>\n</li><li>${secondAtomicMentionHTML} R</li><li>outside</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionItems(page);
  const first = await atomicContent(page).locator(':scope > ul > li').first().elementHandle();
  expect(await page.evaluate(({ a, b }) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<ol><li><p>${b} first</p></li><li title="incoming"><h3>last ${a}</h3></li></ol>` }), { a: atomicMentionHTML, b: secondAtomicMentionHTML })).toBe(true);
  expect(await atomicHTML(page)).toBe(`<ul><li><p title="left">L ${secondAtomicMentionHTML} first</p></li><li title="incoming"><h3>last ${atomicMentionHTML} R</h3></li><li>outside</li></ul>`);
  expect(await first!.evaluate((node) => node === window.editor.surface.querySelector('ul > li'))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  await selectMentionItems(page);
  expect(await page.evaluate(({ a, b }) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<p>${b} first</p><h3>last ${a}</h3>` }), { a: atomicMentionHTML, b: secondAtomicMentionHTML })).toBe(true);
  expect(await atomicHTML(page)).toBe(`<ul><li><p title="left">L ${secondAtomicMentionHTML} first</p><h3>last ${atomicMentionHTML} R</h3></li><li>outside</li></ul>`);
  await expect(atomicContent(page).locator(':scope > ul > li')).toHaveCount(2);
});

test('empty cross-item joins remain editable, plaintext has no IDs and one heading remains a standalone item body', async ({ page }) => {
  const original = `<ul><li>${atomicMentionHTML}</li><li>${secondAtomicMentionHTML}</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionItems(page);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).cut())).toEqual({ html: original, text: '@Anna\n@Bob' });
  expect(await atomicHTML(page)).toBe('<ul><li><br></li></ul>');
  await page.keyboard.insertText('ready');
  await expect(atomicContent(page).locator('li')).toHaveText('ready');
  await page.evaluate((html) => window.editor.setHTML(html), original);
  await selectMentionItems(page);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: '@Anna\nliteral <b>' }))).toBe(true);
  expect(await atomicHTML(page)).toBe('<ul><li>@Anna<br>literal &lt;b&gt;</li></ul>');
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([]);
  await page.evaluate(() => window.editor.setHTML(`<ul><li>L <span data-mw-node="morfira:mention" data-mention-id="person-42">@Anna</span></li><li><span data-mw-node="morfira:mention" data-mention-id="person-7">@Bob</span> R</li></ul>`));
  await selectMentionItems(page);
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<h3>${html}</h3>` }), atomicMentionHTML)).toBe(true);
  expect(await atomicHTML(page)).toBe(`<ul><li><p>L </p><h3>${atomicMentionHTML}</h3><p> R</p></li></ul>`);
  await page.evaluate(() => {
    window.editor.setHTML('<ul><li>suffix</li></ul>');
    window.editor.setSelection(0);
  });
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<ul><li></li><li>${html}</li></ul>` }), atomicMentionHTML)).toBe(true);
  expect(await atomicHTML(page)).toBe(`<ul><li><br></li><li>${atomicMentionHTML}suffix</li></ul>`);
  await page.keyboard.insertText('!');
  await expect(atomicContent(page).locator(':scope > ul > li').last()).toHaveText('@Anna!suffix');
  await expect(atomicContent(page).locator('[data-mention-id]')).toHaveText('@Anna');
  await page.evaluate(() => {
    window.editor.setHTML('<ul><li><br></li></ul>');
    window.editor.setSelection(0);
  });
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<ul><li><h3>${html}</h3></li><li>tail</li></ul>` }), atomicMentionHTML)).toBe(true);
  expect(await atomicHTML(page)).toBe(`<ul><li><p><br></p><h3>${atomicMentionHTML}</h3></li><li>tail</li></ul>`);
});

test('protected crossed branches, list levels, task metadata and protected own bodies refuse without losing references or source nodes', async ({ page }) => {
  await page.route('**/atomic-list-clipboard-test.png', (route) => route.abort());
  const cases = [
    { html: `<ul><li>${atomicMentionHTML}<ul><li><code>protected branch</code></li></ul></li><li>${secondAtomicMentionHTML}</li></ul>` },
    { html: `<ul><li>${atomicMentionHTML}</li><li><p>middle</p><ul><li><pre>protected middle branch</pre></li></ul></li><li>${secondAtomicMentionHTML}</li></ul>` },
    { html: `<ul><li>${atomicMentionHTML}</li></ul><ol><li>${secondAtomicMentionHTML}</li></ol>` },
    { html: `<ul><li>${atomicMentionHTML}<ul><li><code>${secondAtomicMentionHTML}</code></li></ul></li></ul>` },
    { html: `<ul><li>${atomicMentionHTML}</li><li>${secondAtomicMentionHTML}</li></ul>`, checklist: true },
    { html: `<ul><li>${atomicMentionHTML}</li><li><p><img src="/atomic-list-clipboard-test.png"></p></li><li>${secondAtomicMentionHTML}</li></ul>` },
    { html: `<ul><li>${atomicMentionHTML}</li><li><p>mixed</p>loose</li><li>${secondAtomicMentionHTML}</li></ul>` },
  ];
  for (const item of cases) {
    await initializeAtomicMention(page, item.html);
    if (item.checklist) await page.evaluate(() => window.editor.surface.querySelector('li')!.setAttribute('data-checklist-checked', 'true'));
    await selectMentionItems(page, true);
    const refused = await page.evaluate(() => {
      const root = window.editor.surface;
      const first = root.firstElementChild;
      const html = window.editor.getHTML();
      const native = document.getSelection()!;
      const node = native.anchorNode;
      const offset = native.anchorOffset;
      const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
      return { copied: api.copy(), cut: api.cut(), pasted: api.paste({ text: 'blocked' }), unchanged: html === window.editor.getHTML(),
        sameNode: first === root.firstElementChild, selection: node === native.anchorNode && offset === native.anchorOffset,
        undo: window.editor.canUndo(), changes: window.changes.length };
    });
    expect(refused).toEqual({ copied: undefined, cut: undefined, pasted: false, unchanged: true, sameNode: true, selection: true, undo: false, changes: 0 });
  }
});

test('invalid, protected nested, mixed or resource list payloads reject before mutation instead of falling back to plain text', async ({ page }) => {
  const original = `<ul><li>L ${atomicMentionHTML}</li><li>${secondAtomicMentionHTML} R</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionItems(page);
  const rejected = await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    const payloads = [
      '<ul><li><span data-mw-node="morfira:mention" data-mention-id="">@Invalid</span></li></ul>',
      '<ul><li>parent<ul><li><code>protected nested body</code></li></ul></li></ul>',
      '<li>orphan</li>',
      '<ul><li>item</li></ul><p>mixed roots</p>',
      '<ul><li data-checklist-checked="true">task</li></ul>',
      '<ul><li><span data-mw-node="foreign:owner">owned</span></li></ul>',
      '<ul><li><img src="https://example.invalid/no-resource.png"></li></ul>',
      '<ul><li>' + 'x'.repeat(5_000_001) + '</li></ul>',
    ];
    return payloads.map((html) => { try { return api.paste({ html, text: 'fallback' }) === false; } catch { return true; } });
  });
  expect(rejected).toEqual(Array(8).fill(true));
  expect(await atomicHTML(page)).toBe(original);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ undo: false, changes: 0 });
  await page.evaluate(() => { window.editor.setHTML('<p>ordinary target</p>'); window.editor.setSelection(0); });
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<ul><li>${html}</li></ul>` }), atomicMentionHTML)).toBe(false);
  expect(await atomicHTML(page)).toBe('<p>ordinary target</p>');
});

test('list transfers retain merged-cell ownership and reject readonly, composition and writer-time list reconstruction races', async ({ page }) => {
  const list = `<ol start="3"><li>L ${atomicMentionHTML}</li><li>${secondAtomicMentionHTML} R</li></ol>`;
  const original = `<table><tr><td rowspan="2">${list}</td><td>A</td></tr><tr><td>B</td></tr></table><p>outside</p>`;
  await initializeAtomicMention(page, original, { tables: true });
  await selectMentionItems(page);
  const cell = await atomicContent(page).locator('td').first().elementHandle();
  const gated = await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    window.editor.setReadOnly(true);
    const readonly = { copied: api.copy()?.text, cut: api.cut(), pasted: api.paste({ text: 'blocked' }) };
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = api.paste({ html: '<ul><li>blocked</li></ul>' });
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { readonly, composing, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(gated).toEqual({ readonly: { copied: '@Anna\n@Bob', cut: undefined, pasted: false }, composing: false, html: original, undo: false });
  await selectMentionItems(page);
  const raced = await page.evaluate(() => {
    const root = window.editor.surface;
    const old = root.querySelector('ol');
    const data = new DataTransfer();
    const write = data.setData.bind(data);
    let calls = 0;
    data.setData = (type, value) => {
      write(type, value);
      if (++calls === 2) { old!.outerHTML = old!.outerHTML; window.editor.setSelection(0); }
    };
    const event = new ClipboardEvent('cut', { clipboardData: data, bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    return { prevented: event.defaultPrevented, replaced: old !== root.querySelector('ol'), html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.filter((change) => change.source === 'user').length };
  });
  expect(raced).toEqual({ prevented: true, replaced: true, html: original, undo: false, changes: 0 });
  await selectMentionItems(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const oldList = root.querySelector('ol');
    const focus = root.focus.bind(root);
    root.focus = (options) => {
      root.focus = focus;
      focus(options);
      oldList!.outerHTML = oldList!.outerHTML;
      window.editor.setSelection(0);
    };
    try {
      const pasted = window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: '<ul><li>stale</li><li>payload</li></ul>' });
      return { pasted, replaced: oldList !== root.querySelector('ol'), html: window.editor.getHTML(), undo: window.editor.canUndo() };
    }
    finally { root.focus = focus; }
  })).toEqual({ pasted: false, replaced: true, html: original, undo: false });
  await selectMentionItems(page);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: 'joined' }))).toBe(true);
  expect(await cell!.evaluate((node) => node === window.editor.surface.querySelector('td'))).toBe(true);
  await expect(atomicContent(page).locator('td')).toHaveCount(3);
  await expect(atomicContent(page).locator('td').first()).toHaveAttribute('rowspan', '2');
  await expect(atomicContent(page).locator('tr').last().locator('td')).toHaveText('B');
  await expect(atomicContent(page).locator('ol > li')).toHaveText('L joined R');
});
