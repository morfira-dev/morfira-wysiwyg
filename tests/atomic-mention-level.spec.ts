import { expect, test } from '@playwright/test';
import { atomicContent, atomicHTML, atomicMentionHTML, initializeAtomicMention, readAtomicSelection, secondAtomicMentionHTML } from './atomic-mentions.fixture.js';
import { dispatchMentionClipboard } from './atomic-mention-clipboard.fixture.js';
import { levelBranchMention, selectMentionLevels } from './atomic-mention-level.fixture.js';

test('ancestor-to-descendant copy clips backward atom edges while retaining the selected nested tree and safe attributes', async ({ page }) => {
  const original = `<ul><li title="parent"><p>L <strong>${atomicMentionHTML}</strong></p><ol start="4"><li><h2>${secondAtomicMentionHTML} R</h2></li><li>outside child</li></ol></li><li>outside</li></ul>`;
  await initializeAtomicMention(page, original);
  const copied = await page.evaluate(() => {
    const root = window.editor.surface;
    const first = root.querySelector('[data-mention-id="person-42"]')!.firstChild!;
    const last = root.querySelector('[data-mention-id="person-7"]')!.firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(last, 3, first, 1);
    const active = document.activeElement;
    const data = window.atomicMentionModule.mentionClipboardCommands(window.editor).copy();
    return { data, selection: native.anchorNode === last && native.anchorOffset === 3 && native.focusNode === first && native.focusOffset === 1,
      focus: document.activeElement === active, html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length };
  });
  expect(copied).toEqual({
    data: { html: `<ul><li title="parent"><p><strong>${atomicMentionHTML}</strong></p><ol start="4"><li><h2>${secondAtomicMentionHTML}</h2></li></ol></li></ul>`, text: '@Anna\n@Bob' },
    selection: true, focus: true, html: original, undo: false, changes: 0,
  });
  expect(copied.data?.html).not.toMatch(/contenteditable|outside|>L | R</);
  await initializeAtomicMention(page, '<ol start="8"><li>Target </li></ol>');
  await page.evaluate(() => window.editor.setSelection(7));
  expect(await page.evaluate((data) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste(data!), copied.data)).toBe(true);
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([
    { id: 'person-42', text: '@Anna' }, { id: 'person-7', text: '@Bob' },
  ]);
  await expect(atomicContent(page).locator(':scope > ol')).toHaveAttribute('start', '8');
  await expect(atomicContent(page).locator('ol ol')).toHaveAttribute('start', '4');
});

test('descendant-to-outer native cut preserves endpoint levels, suffix and unrelated actual nodes with one backward Undo', async ({ page }) => {
  const original = `<ul><li title="parent">parent<ol start="4"><li><p>L ${atomicMentionHTML}</p></li><li>covered</li></ol></li><li><h2>${secondAtomicMentionHTML} <em>R</em></h2><p>following</p></li><li>outside</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionLevels(page, true);
  const content = atomicContent(page);
  const branch = await content.locator('ol').elementHandle();
  const suffix = await content.locator('em').elementHandle();
  const following = await content.locator('p').last().elementHandle();
  const outside = await content.locator(':scope > ul > li').last().elementHandle();
  const copied = await dispatchMentionClipboard(page, 'cut');
  expect(copied.prevented).toBe(true);
  expect(copied.html).toContain('<ol start="4">');
  expect(copied.html).toContain(atomicMentionHTML);
  expect(copied.html).toContain(secondAtomicMentionHTML);
  expect(copied.html).not.toContain('>parent');
  const cut = '<ul><li title="parent">parent<ol start="4"><li><p>L </p></li></ol></li><li><h2> <em>R</em></h2><p>following</p></li><li>outside</li></ul>';
  expect(await atomicHTML(page)).toBe(cut);
  for (const node of [branch, suffix, following, outside]) expect(await node!.evaluate((element) => element.isConnected && window.editor.surface.contains(element))).toBe(true);
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  await page.keyboard.insertText('!');
  await expect(content.locator('ol > li > p')).toHaveText('L !');
  await expect(content.locator('h2')).toHaveText(' R');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(cut);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await readAtomicSelection(page)).toMatchObject({ backward: true, inside: false });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  expect(await atomicHTML(page)).toBe(cut);
});

test('cousin-branch inline replacement inserts at the retained start and leaves the end suffix in its original branch', async ({ page }) => {
  const original = `<ul><li>first parent<ul title="left"><li><p>L ${atomicMentionHTML}</p></li></ul></li><li><p>covered parent</p><ol title="right"><li><h2>${secondAtomicMentionHTML} R</h2></li><li>following</li></ol></li><li>outside</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionLevels(page);
  const right = await atomicContent(page).locator('[title="right"]').elementHandle();
  const end = await atomicContent(page).locator('h2').elementHandle();
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: 'literal <b>' }))).toBe(true);
  await expect(atomicContent(page).locator('[title="left"] > li > p')).toHaveText('L literal <b>');
  await expect(atomicContent(page).locator('[title="right"] > li > h2')).toHaveText(' R');
  await expect(atomicContent(page).locator('[title="right"] > li').last()).toHaveText('following');
  expect(await page.evaluate(() => {
    const parent = window.editor.surface.querySelector('[title="right"]')!.parentElement!;
    return parent.firstChild?.nodeType === 1 && (parent.firstChild as Element).localName === 'br';
  })).toBe(true);
  expect(await right!.evaluate((node) => node === window.editor.surface.querySelector('[title="right"]'))).toBe(true);
  expect(await end!.evaluate((node) => node === window.editor.surface.querySelector('h2'))).toBe(true);
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([]);
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('ancestor replacement with several bodies retains the descendant suffix subtree and performs one history operation', async ({ page }) => {
  const original = `<ul><li><p title="start">L ${atomicMentionHTML}</p><ol start="4"><li><h2>${secondAtomicMentionHTML} R</h2></li><li>following child</li></ol></li><li>outside</li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionLevels(page);
  const branch = await atomicContent(page).locator('ol').elementHandle();
  const suffix = await atomicContent(page).locator('h2').elementHandle();
  const data = { html: `<p>X</p><h3>Y ${levelBranchMention}</h3>`, text: 'ignored' };
  expect(await dispatchMentionClipboard(page, 'paste', data)).toMatchObject({ prevented: true });
  const pasted = `<ul><li><p title="start">L X</p><h3>Y ${levelBranchMention}</h3><ol start="4"><li><h2> R</h2></li><li>following child</li></ol></li><li>outside</li></ul>`;
  expect(await atomicHTML(page)).toBe(pasted);
  for (const node of [branch, suffix]) expect(await node!.evaluate((element) => element.isConnected && window.editor.surface.contains(element))).toBe(true);
  expect(await readAtomicSelection(page)).toMatchObject({ inside: false });
  await page.keyboard.insertText('!');
  await expect(atomicContent(page).locator('h3')).toHaveText('Y @Child!');
  await expect(atomicContent(page).locator('[data-mention-id]')).toHaveText('@Child');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(pasted);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('recursive list payload across cousin branches adapts to the starting list without flattening the surviving end path', async ({ page }) => {
  const original = `<ul><li>left<ol start="4" title="target"><li>L ${atomicMentionHTML}</li></ol></li><li>covered<ul title="end"><li>${secondAtomicMentionHTML} R</li><li>following</li></ul></li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionLevels(page);
  const end = await atomicContent(page).locator('[title="end"]').elementHandle();
  expect(await page.evaluate(({ a, child }) => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({
    html: `<ul><li>${a}<ol start="7"><li>${child}</li></ol></li><li>second</li></ul>`,
  }), { a: atomicMentionHTML, child: levelBranchMention })).toBe(true);
  await expect(atomicContent(page).locator('[title="target"]')).toHaveAttribute('start', '4');
  await expect(atomicContent(page).locator('[title="target"] > li')).toHaveCount(2);
  await expect(atomicContent(page).locator('[title="target"] ol')).toHaveAttribute('start', '7');
  await expect(atomicContent(page).locator('[title="end"] > li').first()).toHaveText(' R');
  await expect(atomicContent(page).locator('[title="end"] > li').last()).toHaveText('following');
  await expect(atomicContent(page).locator('li > li')).toHaveCount(0);
  expect(await end!.evaluate((node) => node === window.editor.surface.querySelector('[title="end"]'))).toBe(true);
  expect(await page.evaluate(() => window.atomicMentionModule.getMentions(window.editor))).toEqual([
    { id: 'person-42', text: '@Anna' }, { id: 'level-child', text: '@Child' },
  ]);
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('empty ancestor and descendant endpoint bodies remain editable without lifting the descendant item', async ({ page }) => {
  const original = `<ul><li><p>${atomicMentionHTML}</p><ol><li><h2>${secondAtomicMentionHTML}</h2></li></ol></li></ul>`;
  await initializeAtomicMention(page, original);
  await selectMentionLevels(page);
  expect(await page.evaluate(() => !!window.atomicMentionModule.mentionClipboardCommands(window.editor).cut())).toBe(true);
  expect(await atomicHTML(page)).toBe('<ul><li><p><br></p><ol><li><h2><br></h2></li></ol></li></ul>');
  expect(await page.evaluate(() => {
    const body = window.editor.surface.querySelector('p')!;
    const native = document.getSelection()!;
    return native.isCollapsed && native.anchorNode === body && native.anchorOffset === 0;
  })).toBe(true);
  await page.keyboard.insertText('ready');
  await expect(atomicContent(page).locator(':scope > ul > li > p')).toHaveText('ready');
  await expect(atomicContent(page).locator('ol > li > h2')).toHaveJSProperty('innerHTML', '<br>');
  await page.evaluate(() => window.editor.undo());
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(original);
  // Native Range deletion can retain an empty Text before the repaired BR.
  // That placeholder must not become a real line break during body composition.
  const textStart = `<ul><li><p>abc</p><ol><li><h2>${secondAtomicMentionHTML}</h2></li></ol></li></ul>`;
  await page.evaluate((html) => {
    window.editor.setHTML(html);
    const root = window.editor.surface;
    const first = root.querySelector('p')!.firstChild!;
    const last = root.querySelector('[data-mention-id="person-7"]')!;
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEndAfter(last);
    const native = document.getSelection()!;
    native.removeAllRanges();
    native.addRange(range);
  }, textStart);
  expect(await page.evaluate(() => window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ html: '<p>X</p><h3>Y</h3>' }))).toBe(true);
  expect(await atomicHTML(page)).toBe('<ul><li><p>X</p><h3>Y</h3><ol><li><h2><br></h2></li></ol></li></ul>');
  await page.evaluate(() => window.editor.undo());
  expect(await atomicHTML(page)).toBe(textStart);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('unrelated trees and protected affected paths reject before clipboard writes, without fallback or source changes', async ({ page }) => {
  await page.route('**/atomic-level-resource.png', (route) => route.abort());
  const cases = [
    `<ul><li>${atomicMentionHTML}</li></ul><ol><li>${secondAtomicMentionHTML}</li></ol>`,
    `<ul><li>${atomicMentionHTML}<ol><li><code>${secondAtomicMentionHTML}</code></li></ol></li></ul>`,
    `<ul><li>${atomicMentionHTML}<ol><li><p><img src="/atomic-level-resource.png"></p></li><li>${secondAtomicMentionHTML}</li></ol></li></ul>`,
    `<ul><li>${atomicMentionHTML}<ol><li>${secondAtomicMentionHTML}</li></ol><p>body after branch</p></li></ul>`,
  ];
  for (const html of cases) {
    await initializeAtomicMention(page, html);
    await selectMentionLevels(page, true);
    const result = await page.evaluate(() => {
      const root = window.editor.surface;
      const before = window.editor.getHTML();
      const first = root.firstElementChild;
      const native = document.getSelection()!;
      const anchor = native.anchorNode;
      const offset = native.anchorOffset;
      const data = new DataTransfer();
      let writes = 0;
      data.setData = () => { writes++; };
      const event = window.atomicClipboardEvent('cut', { clipboardData: data, bubbles: true, cancelable: true });
      root.dispatchEvent(event);
      const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
      return { writes, prevented: event.defaultPrevented, copied: api.copy(), pasted: api.paste({ text: 'blocked' }),
        unchanged: before === window.editor.getHTML(), sameNode: first === root.firstElementChild,
        selection: native.anchorNode === anchor && native.anchorOffset === offset,
        undo: window.editor.canUndo(), changes: window.changes.length };
    });
    expect(result).toEqual({ writes: 0, prevented: true, copied: undefined, pasted: false, unchanged: true, sameNode: true, selection: true, undo: false, changes: 0 });
  }
  await initializeAtomicMention(page, `<ul><li>${atomicMentionHTML}<ol><li>${secondAtomicMentionHTML}</li></ol></li></ul>`);
  await selectMentionLevels(page);
  const before = await atomicHTML(page);
  expect(await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    const deep = '<ul><li>'.repeat(52) + 'depth' + '</li></ul>'.repeat(52);
    return [deep, '<ul><li>' + 'x'.repeat(5_000_001) + '</li></ul>'].map((html) => {
      try { return !api.paste({ html, text: 'fallback' }); } catch { return true; }
    });
  })).toEqual([true, true]);
  expect(await atomicHTML(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('cross-level targets in a merged cell respect readonly, composition and branch reconstruction during writer or focus callbacks', async ({ page }) => {
  const bodies = `<ul><li><p>L ${atomicMentionHTML}</p><ol title="path"><li><h2>${secondAtomicMentionHTML} R</h2></li></ol></li></ul>`;
  const original = `<table><tbody><tr><td rowspan="2">${bodies}</td><td>A</td></tr><tr><td>B</td></tr></tbody></table><p>outside</p>`;
  await initializeAtomicMention(page, original, { tables: true });
  await selectMentionLevels(page);
  const cell = await atomicContent(page).locator('td').first().elementHandle();
  expect(await page.evaluate(() => {
    const api = window.atomicMentionModule.mentionClipboardCommands(window.editor);
    window.editor.setReadOnly(true);
    const result = { copy: !!api.copy(), cut: api.cut(), paste: api.paste({ text: 'blocked' }) };
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = api.paste({ text: 'blocked' });
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { ...result, composing };
  })).toEqual({ copy: true, cut: undefined, paste: false, composing: false });
  await selectMentionLevels(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const branch = root.querySelector('[title="path"]')!;
    const previous = branch.firstElementChild;
    const data = new DataTransfer();
    const write = data.setData.bind(data);
    let writes = 0;
    data.setData = (type, value) => { write(type, value); if (++writes === 2) { branch.innerHTML = branch.innerHTML; window.editor.setSelection(0); } };
    root.dispatchEvent(window.atomicClipboardEvent('cut', { clipboardData: data, bubbles: true, cancelable: true }));
    return { writes, rebuilt: previous !== branch.firstElementChild, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ writes: 2, rebuilt: true, html: original, undo: false });
  await selectMentionLevels(page);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const branch = root.querySelector('[title="path"]')!;
    const previous = branch.firstElementChild;
    const focus = root.focus.bind(root);
    root.focus = (options) => { root.focus = focus; focus(options); branch.innerHTML = branch.innerHTML; window.editor.setSelection(0); };
    try {
      return { pasted: window.atomicMentionModule.mentionClipboardCommands(window.editor).paste({ text: 'stale' }), rebuilt: previous !== branch.firstElementChild, html: window.editor.getHTML(), undo: window.editor.canUndo() };
    }
    finally { root.focus = focus; }
  })).toEqual({ pasted: false, rebuilt: true, html: original, undo: false });
  expect(await cell!.evaluate((node) => node === window.editor.surface.querySelector('td'))).toBe(true);
  await expect(atomicContent(page).locator('td')).toHaveCount(3);
  await expect(atomicContent(page).locator('td').first()).toHaveAttribute('rowspan', '2');
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(0);
});
