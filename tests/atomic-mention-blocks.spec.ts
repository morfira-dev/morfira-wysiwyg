import { expect, test } from '@playwright/test';
import { atomicContent, atomicHTML, atomicMentionHTML, initializeAtomicMention, readAtomicSelection, secondAtomicMentionHTML } from './atomic-mentions.fixture.js';
import { dispatchMentionClipboard } from './atomic-mention-clipboard.fixture.js';
import { selectMentionBlocks } from './atomic-mention-blocks.fixture.js';

test('cross-block copy privately expands backward token edges and retains block attributes, inline marks and blank boundaries', async ({ page }) => {
  const original = `<p title="first">L <strong>${atomicMentionHTML} one</strong></p><p><br></p><h2 dir="rtl"><em>two ${secondAtomicMentionHTML}</em> R</h2><p>untouched</p>`;
  await initializeAtomicMention(page, original);
  const copied = await page.evaluate(() => {
    const root = window.editor.surface;
    const atoms = root.querySelectorAll('[data-mention-id]');
    const first = atoms[0].firstChild!;
    const last = atoms[1].firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(last, 3, first, 1);
    const active = document.activeElement;
    const data = window.atomicMentionModule.mentionClipboardCommands(window.editor).copy();
    return { data, unchangedSelection: native.anchorNode === last && native.anchorOffset === 3 && native.focusNode === first && native.focusOffset === 1,
      unchangedFocus: document.activeElement === active, html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length };
  });
  expect(copied).toEqual({
    data: { html: `<p title="first"><strong>${atomicMentionHTML} one</strong></p><p><br></p><h2 dir="rtl"><em>two ${secondAtomicMentionHTML}</em></h2>`, text: '@Anna one\n\ntwo @Bob' },
    unchangedSelection: true, unchangedFocus: true, html: original, undo: false, changes: 0,
  });
});

test('native cross-block cut joins the untouched edges and preserves the first and unrelated nodes with one backward Undo', async ({ page }) => {
  const original = `<p title="keep">L ${atomicMentionHTML}</p><p>middle</p><h2>${secondAtomicMentionHTML} <em>R</em></h2><p>outside</p>`;
  await initializeAtomicMention(page, original);
  await selectMentionBlocks(page, true);
  const first = await atomicContent(page).locator(':scope > p').first().elementHandle();
  const outside = await atomicContent(page).locator(':scope > p').last().elementHandle();
  const suffixMark = await atomicContent(page).locator('em').elementHandle();
  const copied = await dispatchMentionClipboard(page, 'cut');
  expect(copied).toEqual({ prevented: true, html: `<p title="keep">${atomicMentionHTML}</p><p>middle</p><h2>${secondAtomicMentionHTML}</h2>`, text: '@Anna\nmiddle\n@Bob' });
  expect(await atomicHTML(page)).toBe('<p title="keep">L  <em>R</em></p><p>outside</p>');
  expect(await first!.evaluate((node) => node === window.editor.surface.firstElementChild)).toBe(true);
  expect(await outside!.evaluate((node) => node === window.editor.surface.lastElementChild)).toBe(true);
  expect(await suffixMark!.evaluate((node) => node === window.editor.surface.querySelector('p > em'))).toBe(true);
  expect(await readAtomicSelection(page)).toMatchObject({ inside: false, logical: { index: 2, length: 0 } });
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await readAtomicSelection(page)).toMatchObject({ backward: true, inside: false });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await atomicHTML(page)).toBe('<p title="keep">L  <em>R</em></p><p>outside</p>');
});

test('multi-block HTML replaces selected references while retaining the first source wrapper and final incoming heading', async ({ page }) => {
  const original = `<p title="left">L ${atomicMentionHTML}</p><h2>${secondAtomicMentionHTML} R</h2><p>outside</p>`;
  await initializeAtomicMention(page, original);
  await selectMentionBlocks(page);
  const first = await atomicContent(page).locator('p').first().elementHandle();
  const outside = await atomicContent(page).locator('p').last().elementHandle();
  expect(await page.evaluate(({ a, b }) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({
    html: `<p>${b} first</p><h3 title="incoming">last ${a}</h3>`, text: 'ignored',
  }), { a: atomicMentionHTML, b: secondAtomicMentionHTML })).toBe(true);
  const pasted = `<p title="left">L ${secondAtomicMentionHTML} first</p><h3 title="incoming">last ${atomicMentionHTML} R</h3><p>outside</p>`;
  expect(await atomicHTML(page)).toBe(pasted);
  expect(await first!.evaluate((node) => node === window.editor.surface.firstElementChild)).toBe(true);
  expect(await outside!.evaluate((node) => node === window.editor.surface.lastElementChild)).toBe(true);
  expect(await readAtomicSelection(page)).toMatchObject({ inside: false });
  await page.keyboard.insertText('!');
  await expect(atomicContent(page).locator('h3')).toHaveText('last @Anna! R');
  await expect(atomicContent(page).locator('h3 [data-mention-id]')).toHaveText('@Anna');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(pasted);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('block paste at a caret splits a paragraph, keeps a middle blank paragraph and types after the final token', async ({ page }) => {
  await initializeAtomicMention(page, '<p>Left Right</p>');
  await page.evaluate(() => window.editor.setSelection(5));
  const payload = { html: `<p>A</p><p></p><h2>${atomicMentionHTML}</h2>`, text: 'A\n\n@Anna' };
  expect(await dispatchMentionClipboard(page, 'paste', payload)).toMatchObject({ prevented: true });
  const pasted = `<p>Left A</p><p><br></p><h2>${atomicMentionHTML}Right</h2>`;
  expect(await atomicHTML(page)).toBe(pasted);
  await page.keyboard.insertText('!');
  await expect(atomicContent(page).locator('h2')).toHaveText('@Anna!Right');
  await expect(atomicContent(page).locator('[data-mention-id]')).toHaveText('@Anna');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(pasted);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe('<p>Left Right</p>');
  // A selected empty paragraph's BR is a placeholder; this unselected trailing
  // BR belongs to nonempty source content and must survive joining the suffix.
  await page.evaluate(() => {
    window.editor.setHTML('<p>Left<br></p>');
    window.editor.setSelection(4);
  });
  expect(await dispatchMentionClipboard(page, 'paste', payload)).toMatchObject({ prevented: true });
  expect(await atomicHTML(page)).toBe(`<p>LeftA</p><p><br></p><h2>${atomicMentionHTML}<br></h2>`);
  await page.evaluate(() => {
    window.editor.setHTML('<p>Left</p>');
    window.editor.setSelection(4);
  });
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<p>${html}</p><p><br></p>` }), atomicMentionHTML)).toBe(true);
  expect(await atomicHTML(page)).toBe(`<p>Left${atomicMentionHTML}</p><p><br></p>`);
  expect(await page.evaluate(() => {
    const tail = window.editor.surface.lastElementChild!;
    const native = document.getSelection()!;
    return { beforePlaceholder: native.anchorNode === tail && native.anchorOffset === 0, collapsed: native.isCollapsed };
  })).toEqual({ beforePlaceholder: true, collapsed: true });
  await page.keyboard.insertText('!');
  await expect(atomicContent(page).locator(':scope > p').last()).toHaveText('!');
  await expect(atomicContent(page).locator('[data-mention-id]')).toHaveText('@Anna');
});

test('one heading stays standalone between the selected source prefix and suffix without nesting it in a paragraph', async ({ page }) => {
  const original = `<p>L ${atomicMentionHTML}</p><h2 title="right">${secondAtomicMentionHTML} R</h2>`;
  await initializeAtomicMention(page, original);
  await selectMentionBlocks(page);
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<h3>${html}</h3>` }), atomicMentionHTML)).toBe(true);
  const pasted = `<p>L </p><h3>${atomicMentionHTML}</h3><h2 title="right"> R</h2>`;
  expect(await atomicHTML(page)).toBe(pasted);
  await page.keyboard.insertText('!');
  await expect(atomicContent(page).locator('h2')).toHaveText('! R');
  await expect(atomicContent(page).locator('h3')).toHaveText('@Anna');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(pasted);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
});

test('full block cut retains an editable placeholder and cross-block plain text replacement never recreates IDs', async ({ page }) => {
  const original = `<p>${atomicMentionHTML}</p><p><br></p><h2>${secondAtomicMentionHTML}</h2>`;
  await initializeAtomicMention(page, original);
  await selectMentionBlocks(page);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).cut())).toEqual({ html: original, text: '@Anna\n\n@Bob' });
  expect(await atomicHTML(page)).toBe('<p><br></p>');
  await page.keyboard.insertText('ready');
  await expect(atomicContent(page)).toHaveText('ready');
  await page.evaluate((html) => window.editor.setHTML(html), original);
  await selectMentionBlocks(page);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: '@Anna\nliteral <b>' }))).toBe(true);
  expect(await atomicHTML(page)).toBe('<p>@Anna<br>literal &lt;b&gt;</p>');
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([]);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  await page.evaluate(() => {
    window.editor.setHTML('<p>Before after</p>');
    window.editor.setSelection(7);
  });
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `\n<p>one ${html}</p>\n` }), atomicMentionHTML)).toBe(true);
  expect(await atomicHTML(page)).toBe(`<p>Before one ${atomicMentionHTML}after</p>`);
});

test('sibling-block paste stays inside its ordinary quote, list item or merged cell and preserves actual surrounding owners', async ({ page }) => {
  const bodies = `<p>L ${atomicMentionHTML}</p><h2>${secondAtomicMentionHTML} R</h2>`;
  const profiles = [
    { html: `<blockquote>${bodies}</blockquote><p>outside</p>`, parent: 'blockquote', untouched: ':scope > p', tables: false },
    { html: `<ul><li>${bodies}<ul><li>branch</li></ul></li><li>other item</li></ul><p>outside</p>`, parent: 'ul > li', untouched: 'ul > li > ul', tables: false },
    { html: `<table><tr><td rowspan="2">${bodies}</td><td>A</td></tr><tr><td>B</td></tr></table><p>outside</p>`, parent: 'td', untouched: 'tr:last-child > td', tables: true },
  ];
  for (const profile of profiles) {
    await initializeAtomicMention(page, profile.html, { tables: profile.tables });
    await selectMentionBlocks(page);
    const parent = await atomicContent(page).locator(profile.parent).first().elementHandle();
    const untouched = await atomicContent(page).locator(profile.untouched).first().elementHandle();
    expect(await page.evaluate(({ a, b }) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<p>${b}</p><h3>${a}</h3>` }), { a: atomicMentionHTML, b: secondAtomicMentionHTML })).toBe(true);
    expect(await parent!.evaluate((node, selector) => node === window.editor.surface.querySelector(selector), profile.parent)).toBe(true);
    expect(await untouched!.evaluate((node) => node.isConnected && window.editor.surface.contains(node))).toBe(true);
    await expect(atomicContent(page).locator(`${profile.parent} > p`).first()).toHaveText('L @Bob');
    await expect(atomicContent(page).locator(`${profile.parent} > h3`).first()).toHaveText('@Anna R');
    if (profile.tables) {
      await expect(atomicContent(page).locator('td')).toHaveCount(3);
      await expect(atomicContent(page).locator('td').first()).toHaveAttribute('rowspan', '2');
    }
  }
});

test('protected middle blocks and cross-item endpoints refuse without deleting IDs, nodes or selection', async ({ page }) => {
  await page.route('**/atomic-cross-clipboard-test.png', (route) => route.abort());
  const cases = [
    `<p>${atomicMentionHTML}</p><pre>protected</pre><p>${secondAtomicMentionHTML}</p>`,
    `<p>${atomicMentionHTML}</p><p><a href="/protected">link</a></p><p>${secondAtomicMentionHTML}</p>`,
    `<p>${atomicMentionHTML}</p><p><img src="/atomic-cross-clipboard-test.png"></p><p>${secondAtomicMentionHTML}</p>`,
    `<blockquote><p>${atomicMentionHTML}</p>\u00a0<h2>${secondAtomicMentionHTML}</h2></blockquote>`,
    `<ul><li><p>${atomicMentionHTML}</p></li><li><p>${secondAtomicMentionHTML}</p></li></ul>`,
    `<p>${atomicMentionHTML}</p><blockquote><p>${secondAtomicMentionHTML}</p></blockquote>`,
  ];
  for (const html of cases) {
    await initializeAtomicMention(page, html);
    await selectMentionBlocks(page, true);
    const refused = await page.evaluate(() => {
      const root = window.editor.surface;
      const first = root.firstElementChild;
      const before = window.editor.getHTML();
      const native = document.getSelection()!;
      const anchor = native.anchorNode;
      const offset = native.anchorOffset;
      const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
      return { copied: api.copy(), cut: api.cut(), pasted: api.paste({ text: 'must not remove tokens' }),
        unchanged: before === window.editor.getHTML(), sameNode: first === root.firstElementChild,
        sameSelection: native.anchorNode === anchor && native.anchorOffset === offset,
        undo: window.editor.canUndo(), changes: window.changes.length };
    });
    expect(refused).toEqual({ copied: undefined, cut: undefined, pasted: false, unchanged: true, sameNode: true, sameSelection: true, undo: false, changes: 0 });
  }
});

test('cross-block mutation remains atomic under invalid incoming IDs, readonly, composition and parent replacement during focus', async ({ page }) => {
  const original = `<p>L ${atomicMentionHTML}</p><h2>${secondAtomicMentionHTML} R</h2>`;
  await initializeAtomicMention(page, original);
  await selectMentionBlocks(page);
  expect(await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    const invalid = api.paste({ html: '<p>valid first</p><h2><span data-mw-node="morfira:mention" data-mention-id="">@Invalid</span></h2>', text: 'fallback' });
    window.editor.setReadOnly(true);
    const readonly = { copied: api.copy()?.text, cut: api.cut(), pasted: api.paste({ text: 'blocked' }) };
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = api.paste({ html: '<p>A</p><p>B</p>' });
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { invalid, readonly, composing, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ invalid: false, readonly: { copied: '@Anna\n@Bob', cut: undefined, pasted: false }, composing: false, html: original, undo: false });
  await selectMentionBlocks(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const oldParent = root.firstElementChild;
    const focus = root.focus.bind(root);
    root.focus = (options) => {
      root.focus = focus;
      focus(options);
      root.innerHTML = root.innerHTML;
      window.editor.setSelection(0);
    };
    try {
      const pasted = window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: '<p>stale</p><h2>payload</h2>' });
      return { pasted, replaced: oldParent !== root.firstElementChild, html: window.editor.getHTML(), undo: window.editor.canUndo() };
    }
    finally { root.focus = focus; }
  })).toEqual({ pasted: false, replaced: true, html: original, undo: false });
});
