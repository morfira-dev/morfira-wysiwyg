import { expect, test } from '@playwright/test';
import { atomicContent, atomicHTML, atomicMentionHTML, initializeAtomicMention, readAtomicSelection, secondAtomicMentionHTML } from './atomic-mentions.fixture.js';
import { dispatchMentionClipboard } from './atomic-mention-clipboard.fixture.js';
import { selectMentionItems } from './atomic-mention-list.fixture.js';
import { deepBranchMention, firstSelectedBranch, middleSelectedBranch } from './atomic-mention-nested.fixture.js';

test('backward copy preserves selected first, middle and deep branch hierarchy, attributes and ID order without changing selection', async ({ page }) => {
  const original = `<ol start="3"><li title="keep">L <strong>${atomicMentionHTML}</strong>${firstSelectedBranch}</li><li><h3>middle</h3>${middleSelectedBranch}</li><li>${secondAtomicMentionHTML} R<ul title="unselected"><li>untouched</li></ul></li></ol>`;
  await initializeAtomicMention(page, original);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const first = root.querySelector('[data-mention-id="person-42"]')!.firstChild!;
    const last = root.querySelector('[data-mention-id="person-7"]')!.firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(last, 3, first, 1);
    const active = document.activeElement;
    const data = window.atomicMentionModule.mentionClipboardCommands(window.editor).copy();
    return { data, unchanged: native.anchorNode === last && native.anchorOffset === 3 && native.focusNode === first && native.focusOffset === 1,
      focus: document.activeElement === active, html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length };
  });
  expect(result).toEqual({
    data: { html: `<ol start="3"><li title="keep"><strong>${atomicMentionHTML}</strong>${firstSelectedBranch}</li><li><h3>middle</h3>${middleSelectedBranch}</li><li>${secondAtomicMentionHTML}</li></ol>`, text: '@Anna\n@First\n@Deep\nmiddle\n@Middle\n@Bob' },
    unchanged: true, focus: true, html: original, undo: false, changes: 0,
  });
  expect(result.data?.html).not.toMatch(/contenteditable|unselected|untouched/);
  // Ownership can come solely from the crossed branch: endpoint labels need
  // not themselves be atoms for native copy to preserve nested references.
  await page.evaluate((branch) => {
    window.editor.setHTML(`<ul><li title="plain start">L start${branch}</li><li title="plain end">end R</li></ul>`);
    const first = window.editor.surface.querySelector('[title="plain start"]')!.firstChild!;
    const last = window.editor.surface.querySelector('[title="plain end"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(first, 2, last, 3);
  }, firstSelectedBranch);
  expect(await dispatchMentionClipboard(page, 'copy')).toEqual({ prevented: true,
    html: `<ul><li title="plain start">start${firstSelectedBranch}</li><li title="plain end">end</li></ul>`, text: 'start\n@First\n@Deep\nend' });
});

test('native cut transfers covered branch IDs once and preserves actual final suffix, following bodies and unselected branch with Undo', async ({ page }) => {
  const original = `<ul><li title="keep">L ${atomicMentionHTML}${firstSelectedBranch}</li><li>middle${middleSelectedBranch}</li><li><h2>${secondAtomicMentionHTML} <em>R</em></h2><p>following</p><ul title="unselected"><li>untouched</li></ul></li><li>outside</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionItems(page, true);
  const content = atomicContent(page);
  const first = await content.locator(':scope > ul > li').first().elementHandle();
  const suffix = await content.locator('em').elementHandle();
  const following = await content.locator(':scope > ul > li > p').elementHandle();
  const unselected = await content.locator('[title="unselected"]').elementHandle();
  const selected = await content.locator('[title="selected first"]').elementHandle();
  const outside = await content.locator(':scope > ul > li').last().elementHandle();
  const copied = await dispatchMentionClipboard(page, 'cut');
  expect(copied.prevented).toBe(true);
  expect(copied.text).toBe('@Anna\n@First\n@Deep\nmiddle\n@Middle\n@Bob');
  expect(copied.html).toContain(firstSelectedBranch);
  expect(copied.html).toContain(middleSelectedBranch);
  const cut = '<ul><li title="keep"><p>L  <em>R</em></p><p>following</p><ul title="unselected"><li>untouched</li></ul></li><li>outside</li></ul>';
  expect(await atomicHTML(page)).toBe(cut);
  expect(await first!.evaluate((node) => node === window.editor.surface.querySelector('ul > li'))).toBe(true);
  for (const node of [suffix, following, unselected, outside]) expect(await node!.evaluate((element) => element.isConnected && window.editor.surface.contains(element))).toBe(true);
  expect(await selected!.evaluate((node) => node.isConnected)).toBe(false);
  expect(await page.evaluate(() => ({ refs: window.atomicMentionModule.getMentions(window.editor), changes: window.changes.filter((change) => change.source === 'user').length }))).toEqual({ refs: [], changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await readAtomicSelection(page)).toMatchObject({ backward: true, inside: false });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await atomicHTML(page)).toBe(cut);
});

test('nested list paste at a caret retains destination type and puts following bodies before incoming then unselected source branches', async ({ page }) => {
  const original = '<ol start="6"><li title="keep"><p>Left Right</p><p>following</p><ul title="source branch"><li>old child</li></ul></li><li>outside</li></ol>';
  await initializeAtomicMention(page, original);
  const sourceBranch = await atomicContent(page).locator('[title="source branch"]').elementHandle();
  const following = await atomicContent(page).locator('p').nth(1).elementHandle();
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('p')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 5, text, 5);
  });
  const data = { html: `<ul><li>${atomicMentionHTML}${firstSelectedBranch}</li><li title="incoming">${secondAtomicMentionHTML}${middleSelectedBranch}</li></ul>`, text: '@Anna\n@First\n@Deep\n@Bob\n@Middle' };
  expect(await dispatchMentionClipboard(page, 'paste', data)).toMatchObject({ prevented: true });
  const pasted = `<ol start="6"><li title="keep"><p>Left ${atomicMentionHTML}</p>${firstSelectedBranch}</li><li title="incoming"><p>${secondAtomicMentionHTML}Right</p><p>following</p>${middleSelectedBranch}<ul title="source branch"><li>old child</li></ul></li><li>outside</li></ol>`;
  expect(await atomicHTML(page)).toBe(pasted);
  for (const node of [sourceBranch, following]) expect(await node!.evaluate((element) => element.isConnected && window.editor.surface.contains(element))).toBe(true);
  await expect(atomicContent(page).locator('li > li')).toHaveCount(0);
  await page.keyboard.insertText('!');
  await expect(atomicContent(page).locator(':scope > ol > li').nth(1).locator(':scope > p').first()).toHaveText('@Bob!Right');
  await expect(atomicContent(page).locator('[data-mention-id="person-7"]')).toHaveText('@Bob');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(pasted);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
});

test('one incoming item with a heading and branch replaces selected trees without duplicating their IDs and retains the final unselected branch', async ({ page }) => {
  const original = `<ul><li>L ${atomicMentionHTML}${firstSelectedBranch}</li><li>middle${middleSelectedBranch}</li><li><h2>${secondAtomicMentionHTML} R</h2><p>following</p><ul title="unselected"><li>old child</li></ul></li><li>outside</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionItems(page);
  const unselected = await atomicContent(page).locator('[title="unselected"]').elementHandle();
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<ol><li><h3>insert ${html}</h3><ol start="9" title="incoming branch"><li>new child</li></ol></li></ol>` }), atomicMentionHTML)).toBe(true);
  expect(await atomicHTML(page)).toBe(`<ul><li><p>L </p><h3>insert ${atomicMentionHTML}</h3><p> R</p><p>following</p><ol start="9" title="incoming branch"><li>new child</li></ol><ul title="unselected"><li>old child</li></ul></li><li>outside</li></ul>`);
  expect(await unselected!.evaluate((node) => node === window.editor.surface.querySelector('[title="unselected"]'))).toBe(true);
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([{ id: 'person-42', text: '@Anna' }]);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
});

test('paragraph-heading replacement removes all selected branch trees while empty own bodies in incoming branches stay editable', async ({ page }) => {
  const original = `<ul><li>L ${atomicMentionHTML}${firstSelectedBranch}</li><li>${secondAtomicMentionHTML} R</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionItems(page);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: '<p>new</p><h3>last</h3>' }))).toBe(true);
  expect(await atomicHTML(page)).toBe('<ul><li><p>L new</p><h3>last R</h3></li></ul>');
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([]);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  await page.evaluate(() => { window.editor.setHTML('<ul><li><br></li></ul>'); window.editor.setSelection(0); });
  expect(await page.evaluate((html) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: `<ul><li><ul title="empty own"><li><p></p><ol><li>${html}</li></ol></li></ul></li></ul>` }), deepBranchMention)).toBe(true);
  await expect(atomicContent(page).locator(':scope > ul > li > br')).toHaveCount(1);
  await expect(atomicContent(page).locator('[title="empty own"] > li > p')).toHaveJSProperty('innerHTML', '<br>');
  await expect(atomicContent(page).locator('[title="empty own"] > li > ol > li [data-mention-id="branch-deep"]')).toHaveText('@Deep');
  expect(await readAtomicSelection(page)).toMatchObject({ inside: false });
  // The initial own BR is a placeholder even when the LI also owns a selected
  // branch. It must not survive as a real leading break after the suffix join.
  const placeholderSource = `<ul><li><br><ul><li>${deepBranchMention}</li></ul></li><li>endSuffix</li></ul>`;
  await page.evaluate((html) => {
    window.editor.setHTML(html);
    const items = window.editor.surface.querySelectorAll(':scope > ul > li');
    document.getSelection()!.setBaseAndExtent(items[0], 1, items[1].firstChild!, 0);
  }, placeholderSource);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).cut()?.html)).toContain('data-mention-id="branch-deep"');
  expect(await atomicHTML(page)).toBe('<ul><li>endSuffix</li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(placeholderSource);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('a protected selected branch at any depth rejects before writing clipboard data or mutating any source item', async ({ page }) => {
  let resourceRequests = 0;
  await page.route('**/atomic-nested-clipboard-test.png', (route) => { resourceRequests++; return route.abort(); });
  const variants = ['code', 'resource', 'task', 'foreign', 'interleaved'] as const;
  for (const variant of variants) {
    const original = `<ul><li>${atomicMentionHTML}<ul title="selected"><li><p>child</p><ol title="deep"><li>deep</li></ol></li></ul></li><li>${secondAtomicMentionHTML}</li></ul>`;
    await initializeAtomicMention(page, original);
    await page.evaluate((variant) => {
      const item = window.editor.surface.querySelector('[title="deep"] > li')!;
      if (variant === 'code') item.innerHTML = '<code>protected</code>';
      else if (variant === 'resource') item.innerHTML = '<img src="/atomic-nested-clipboard-test.png">';
      else if (variant === 'task') item.setAttribute('data-checklist-checked', 'true');
      else if (variant === 'foreign') item.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      else item.innerHTML = '<ul><li>branch</li></ul><p>body after branch</p>';
    }, variant);
    if (variant === 'resource') await expect.poll(() => resourceRequests).toBe(1);
    await selectMentionItems(page);
    const result = await page.evaluate(() => {
      const root = window.editor.surface;
      const first = root.firstElementChild;
      const native = document.getSelection()!;
      const node = native.anchorNode;
      const offset = native.anchorOffset;
      const before = window.editor.getHTML();
      const data = new DataTransfer();
      let writes = 0;
      data.setData = () => { writes++; };
      const event = new ClipboardEvent('cut', { clipboardData: data, bubbles: true, cancelable: true });
      root.dispatchEvent(event);
      const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
      return { writes, prevented: event.defaultPrevented, copied: api.copy(), pasted: api.paste({ text: 'blocked' }),
        unchanged: before === window.editor.getHTML(), sameNode: first === root.firstElementChild,
        sameSelection: native.anchorNode === node && native.anchorOffset === offset,
        undo: window.editor.canUndo(), changes: window.changes.length };
    });
    expect(result).toEqual({ writes: 0, prevented: true, copied: undefined, pasted: false, unchanged: true, sameNode: true, sameSelection: true, undo: false, changes: 0 });
    if (variant === 'resource') {
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(resourceRequests).toBe(1);
    }
  }
});

test('malformed nested references, deep task/resource owners and whole-tree limits reject without plaintext fallback', async ({ page }) => {
  let resourceRequests = 0;
  await page.route('**/no-nested-request.png', (route) => { resourceRequests++; return route.abort(); });
  await initializeAtomicMention(page, `<ul><li>L ${atomicMentionHTML}</li><li>${secondAtomicMentionHTML} R</li></ul>`);
  await selectMentionItems(page);
  const before = await atomicHTML(page);
  const rejected = await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    const payloads = [
      '<ul><li>parent<ol><li><span data-mw-node="morfira:mention" data-mention-id="">@Invalid</span></li></ol></li></ul>',
      '<ul><li>parent<ul><li data-checklist-checked="true">task</li></ul></li></ul>',
      '<ul><li>parent<ul><li><img src="https://example.invalid/no-nested-request.png"></li></ul></li></ul>',
      '<ul><li>parent<ol><li><span data-mw-node="foreign:owner">owned</span></li></ol></li></ul>',
      '<ul><li>parent<ul><li><code>protected</code></li></ul></li></ul>',
      '<ul><li>parent<ul><li>nested</li></ul><p>interleaved body</p></li></ul>',
      '<ul><li>'.repeat(55) + 'deep' + '</li></ul>'.repeat(55),
      '<ul><li>' + '<span>x</span>'.repeat(50_001) + '</li></ul>',
      '<ul><li>' + 'x'.repeat(5_000_001) + '</li></ul>',
    ];
    return payloads.map((html) => { try { return !api.paste({ html, text: 'fallback' }); } catch { return true; } });
  });
  expect(rejected).toEqual(Array(9).fill(true));
  expect(await atomicHTML(page)).toBe(before);
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ undo: false, changes: 0 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(resourceRequests).toBe(0);
});

test('branch-only reconstruction during writer/focus callbacks invalidates transfers while readonly and IME preserve merged-cell ownership', async ({ page }) => {
  const list = `<ul><li>L ${atomicMentionHTML}${firstSelectedBranch}</li><li>${secondAtomicMentionHTML} R</li></ul>`;
  const original = `<table><tr><td rowspan="2">${list}</td><td>A</td></tr><tr><td>B</td></tr></table><p>outside</p>`;
  await initializeAtomicMention(page, original, { tables: true });
  await selectMentionItems(page);
  const cell = await atomicContent(page).locator('td').first().elementHandle();
  const gated = await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    window.editor.setReadOnly(true);
    const readonly = { text: api.copy()?.text, cut: api.cut(), pasted: api.paste({ text: 'blocked' }) };
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = api.paste({ text: 'blocked' });
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { readonly, composing, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(gated).toEqual({ readonly: { text: '@Anna\n@First\n@Deep\n@Bob', cut: undefined, pasted: false }, composing: false, html: original, undo: false });
  await selectMentionItems(page);
  const writer = await page.evaluate(() => {
    const root = window.editor.surface;
    const old = root.querySelector('[title="selected deep"]')!;
    const data = new DataTransfer();
    const write = data.setData.bind(data);
    let writes = 0;
    data.setData = (type, value) => { write(type, value); if (++writes === 2) old.outerHTML = old.outerHTML; };
    root.dispatchEvent(new ClipboardEvent('cut', { clipboardData: data, bubbles: true, cancelable: true }));
    return { replaced: old !== root.querySelector('[title="selected deep"]'), html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.filter((change) => change.source === 'user').length };
  });
  expect(writer).toEqual({ replaced: true, html: original, undo: false, changes: 0 });
  await selectMentionItems(page);
  const focus = await page.evaluate(() => {
    const root = window.editor.surface;
    const old = root.querySelector('[title="selected deep"]')!;
    const focus = root.focus.bind(root);
    root.focus = (options) => { root.focus = focus; focus(options); old.outerHTML = old.outerHTML; };
    try { return { pasted: window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: 'stale' }), replaced: old !== root.querySelector('[title="selected deep"]'), html: window.editor.getHTML(), undo: window.editor.canUndo() }; }
    finally { root.focus = focus; }
  });
  expect(focus).toEqual({ pasted: false, replaced: true, html: original, undo: false });
  await selectMentionItems(page);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: 'joined' }))).toBe(true);
  expect(await cell!.evaluate((node) => node === window.editor.surface.querySelector('td'))).toBe(true);
  await expect(atomicContent(page).locator('td')).toHaveCount(3);
  await expect(atomicContent(page).locator('td').first()).toHaveAttribute('rowspan', '2');
  await expect(atomicContent(page).locator('td').first().locator(':scope > ul > li')).toHaveText('L joined R');
});
