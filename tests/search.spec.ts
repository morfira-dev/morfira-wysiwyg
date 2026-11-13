import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SearchCommands, SearchState } from '@morfira-dev/wysiwyg/plugins/search';

declare global { interface Window { searchAPI: SearchCommands; searchEvents: SearchState[]; stopSearch: () => void; } }
const initialize = async (page: Page, html = '<p>One one ONE</p>') => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.dispose(); const host = document.createElement('div'); host.className = 'search-test'; document.body.append(host);
    window.editor = window.createEditor(host, { value, plugins: [window.createSearch()] });
    window.searchAPI = window.searchCommands(window.editor); window.searchEvents = [];
    window.stopSearch = window.searchAPI.subscribe((state) => window.searchEvents.push(state));
    window.changes = []; window.editor.subscribe((change) => window.changes.push(change)); window.editor.setSelection(0);
  }, html);
};
const content = (page: Page) => page.locator('.search-test .mw-content');
const state = (page: Page) => page.evaluate(() => window.searchAPI.getState());
const query = async (page: Page, value: string, options?: { caseSensitive?: boolean; wholeWord?: boolean }) => page.evaluate(({ text, settings }) => window.searchAPI.setQuery(text, settings), { text: value, settings: options });

test('literal metacharacters and case options search without changing content, focus or history', async ({ page }) => {
  await initialize(page, '<p>A+B a+b A.B (A+B) [x] $&</p>'); const before = await content(page).innerHTML();
  await query(page, 'A+B'); expect((await state(page)).matches.map((match) => match.text)).toEqual(['A+B', 'a+b', 'A+B']);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 0 });
  await query(page, 'A+B', { caseSensitive: true }); expect((await state(page)).matches).toHaveLength(2);
  await query(page, '[x]'); expect((await state(page)).matches).toHaveLength(1);
  await query(page, '$&'); expect((await state(page)).matches).toHaveLength(1);
  expect(await content(page).innerHTML()).toBe(before); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('Unicode case folding and UTF-16 offsets do not use length-changing lowercase strings', async ({ page }) => {
  await initialize(page, '<p>😀 K K k İ i ſ S</p>');
  await query(page, 'k'); expect((await state(page)).matches).toEqual([{ index: 3, length: 1, text: 'K' }, { index: 5, length: 1, text: 'K' }, { index: 7, length: 1, text: 'k' }]);
  await query(page, 'İ'); expect((await state(page)).matches).toEqual([{ index: 9, length: 1, text: 'İ' }]);
  await page.evaluate(() => window.searchAPI.select(0)); expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('İ');
  await query(page, 's'); expect((await state(page)).matches.map((match) => match.text)).toEqual(['ſ', 'S']);
  await page.evaluate(() => window.editor.surface.querySelector('p')!.firstChild!.textContent = 'x\udc00cat');
  await query(page, 'cat', { wholeWord: true }); expect((await state(page)).matches).toHaveLength(1);
});

test('whole-word boundaries include Cyrillic letters, combining marks, numbers and connectors', async ({ page }) => {
  await initialize(page, '<p>кот котик скот кот_ кот2 кот́ кот 😀кот😀 (КОТ)</p>');
  await query(page, 'кот', { wholeWord: true }); expect((await state(page)).matches.map((match) => match.text)).toEqual(['кот', 'кот', 'кот', 'КОТ']);
  await query(page, 'кот', { wholeWord: true, caseSensitive: true }); expect((await state(page)).matches).toHaveLength(3);
  await page.evaluate(() => window.editor.setHTML('<p>𐐀кот кот𐐀 кот</p>')); expect((await state(page)).matches).toHaveLength(1);
});

test('matches cross inline marks/links but not paragraphs, line breaks, images, cells or captions', async ({ page }) => {
  await initialize(page, '<p>A <strong>Need</strong><a href="/keep"><em>le</em></a> Z</p><p>Need</p><p>le</p><p>Need<br>le</p><p>Need<img src="/logo.svg" alt="Needle">le</p><table><tbody><tr><td>Need</td><td>le</td></tr></tbody></table><figure><img src="/logo.svg" title="Needle"><figcaption>Needle</figcaption></figure>');
  await query(page, 'Needle'); expect((await state(page)).matches).toHaveLength(2);
  expect((await state(page)).matches[0]).toEqual({ index: 2, length: 6, text: 'Needle' });
  await page.evaluate(() => window.searchAPI.select(0)); expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Needle');
  await page.evaluate(() => window.searchAPI.next()); expect(await page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest('figcaption')?.textContent)).toBe('Needle');
  await query(page, 'le ZNeed'); expect((await state(page)).matches).toHaveLength(0);
});

test('list/container boundaries stop matches even though text offsets are contiguous', async ({ page }) => {
  await initialize(page, '<ul><li>Need<ol><li>le</li></ol>Need</li><li>le</li></ul><blockquote>Need<p>le</p></blockquote><pre>Need</pre><p>le</p>');
  await query(page, 'Needle'); expect((await state(page)).matches).toHaveLength(0);
  await query(page, 'Need'); expect((await state(page)).matches.map((match) => match.index)).toEqual([0, 6, 12, 18]);
});

test('next/previous wrap and select actual text without persistent highlight markup', async ({ page }) => {
  await initialize(page, '<p>one <strong>two</strong> one <em>one</em></p>'); const before = await content(page).innerHTML();
  await query(page, 'one'); await page.evaluate(() => window.searchAPI.select(0));
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 3 });
  expect(await page.evaluate(() => window.searchAPI.previous())).toEqual({ index: 12, length: 3, text: 'one' });
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('one');
  await page.evaluate(() => window.searchAPI.next()); expect((await state(page)).current).toBe(0);
  await page.evaluate(() => window.searchAPI.next()); expect((await state(page)).current).toBe(1);
  expect(await content(page).innerHTML()).toBe(before); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await query(page, 'absent'); expect(await page.evaluate(() => window.searchAPI.next())).toBeUndefined(); expect(await page.evaluate(() => window.searchAPI.previous())).toBeUndefined();
});

test('current replacement inherits the starting mark/link and keeps unaffected rich neighbors', async ({ page }) => {
  await initialize(page, '<p><a href="/keep"><strong>ABca</strong></a><em>tDE</em> cat</p>');
  await query(page, 'cat'); await page.evaluate(() => { window.searchAPI.select(0); window.editor.setSelection(0); });
  expect(await page.evaluate(() => window.searchAPI.replaceCurrent('<b>$&</b>'))).toBe(true);
  await expect(content(page).locator('a strong')).toHaveText('AB<b>$&</b>'); await expect(content(page).locator('em')).toHaveText('DE');
  await expect(content(page).locator('b')).toHaveCount(0); await expect(content(page).locator('a')).toHaveAttribute('href', '/keep');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 11, length: 0 });
  expect((await state(page)).matches).toHaveLength(1);
  await page.evaluate(() => window.editor.undo()); await expect(content(page)).toHaveText('ABcatDE cat');
  await page.evaluate(() => window.editor.redo()); await expect(content(page)).toHaveText('AB<b>$&</b>DE cat');
});

test('replaceAll snapshots original matches and makes one undo step across marks and blocks', async ({ page }) => {
  await initialize(page, '<p><strong>a</strong>a <em>aa</em></p><p><a href="/keep">aa</a></p>');
  await query(page, 'aa'); await page.evaluate(() => window.searchAPI.select(1));
  expect(await page.evaluate(() => window.searchAPI.replaceAll('aaaa'))).toBe(3);
  await expect(content(page).locator('p')).toHaveText(['aaaa aaaa', 'aaaa']); await expect(content(page).locator('strong')).toHaveText('aaaa'); await expect(content(page).locator('em')).toHaveText('aaaa');
  await expect(content(page).locator('a')).toHaveAttribute('href', '/keep'); expect((await state(page)).matches).toHaveLength(6);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 4, length: 0 });
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('p')).toHaveText(['aa aa', 'aa']); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 3, length: 2 });
  await page.evaluate(() => window.editor.redo()); await expect(content(page).locator('p')).toHaveText(['aaaa aaaa', 'aaaa']);
});

test('deletion and replacement preserve images, captions, lists and merged cell geometry', async ({ page }) => {
  await initialize(page, '<ul><li><strong>cat</strong></li></ul><table><tbody><tr><td rowspan="2"><em>cat</em></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><figure><img src="/logo.svg" width="40" height="30"><figcaption>cat picture</figcaption></figure>');
  await query(page, 'cat'); expect(await page.evaluate(() => window.searchAPI.replaceAll('dog'))).toBe(3);
  await expect(content(page).locator('li strong')).toHaveText('dog'); await expect(content(page).locator('td[rowspan="2"] em')).toHaveText('dog'); await expect(content(page).locator('td')).toHaveCount(3);
  await expect(content(page).locator('figcaption')).toHaveText('dog picture'); await expect(content(page).locator('figure img')).toHaveAttribute('height', '30');
  await query(page, 'dog'); expect(await page.evaluate(() => window.searchAPI.replaceAll(''))).toBe(3);
  await expect(content(page).locator('li')).toHaveCount(1); await expect(content(page).locator('td[rowspan="2"]')).toHaveCount(1); await expect(content(page).locator('img')).toHaveCount(1); await expect(content(page).locator('figcaption')).toHaveText(' picture');
});

test('identical replacement and no-match commands create no history or user changes', async ({ page }) => {
  await initialize(page, '<p>one one</p>'); await query(page, 'one');
  expect(await page.evaluate(() => window.searchAPI.replaceCurrent('one'))).toBe(false); expect(await page.evaluate(() => window.searchAPI.replaceAll('one'))).toBe(0);
  await query(page, 'absent'); expect(await page.evaluate(() => window.searchAPI.replaceAll('other'))).toBe(0);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false); expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('readonly permits navigation and blocks replacements; IME composition blocks replacement', async ({ page }) => {
  await initialize(page); await query(page, 'one');
  await page.evaluate(() => { window.editor.setReadOnly(true); window.searchAPI.select(1); });
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('one');
  expect(await page.evaluate(() => window.searchAPI.replaceCurrent('Two'))).toBe(false); expect(await page.evaluate(() => window.searchAPI.replaceAll('Two'))).toBe(0);
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
  expect(await page.evaluate(() => window.searchAPI.replaceAll('Two'))).toBe(0);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  expect(await page.evaluate(() => window.searchAPI.replaceAll('Two'))).toBe(3); await expect(content(page)).toHaveText('Two Two Two');
});

test('input, formatting, undo and external replacement recompute matches without moving caret', async ({ page }) => {
  await initialize(page, '<p>one two one</p>'); await query(page, 'one'); await page.evaluate(() => { window.searchAPI.select(1); window.editor.setSelection(11); });
  await page.keyboard.type(' one'); expect((await state(page)).matches).toHaveLength(3);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 15, length: 0 });
  await page.evaluate(() => window.editor.undo()); expect((await state(page)).matches).toHaveLength(2);
  await page.evaluate(() => { window.editor.setSelection(0, 3); window.editor.format('bold', true); }); expect((await state(page)).matches).toHaveLength(2);
  await page.evaluate(() => { window.changes = []; window.editor.setHTML('<p>ONE replacement</p>'); }); expect((await state(page)).matches).toHaveLength(1);
  expect(await page.evaluate(() => window.changes.map((change) => change.source))).toEqual(['api']); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('no-op formatting that recreates identical DOM never leaves detached search ranges', async ({ page }) => {
  await initialize(page, '<p>foo foo</p>');
  const result = await page.evaluate(() => {
    window.searchAPI.setQuery('foo'); window.editor.setSelection(0, 3); window.editor.format('italic', false);
    window.searchAPI.select(0); const selected = window.getSelection()?.toString(); const contained = window.editor.surface.contains(window.getSelection()!.anchorNode);
    window.searchAPI.next(); const next = window.getSelection()?.toString(); const nextOffset = window.editor.getSelection();
    const count = window.searchAPI.replaceAll('bar'); return { selected, contained, next, nextOffset, count };
  });
  expect(result).toEqual({ selected: 'foo', contained: true, next: 'foo', nextOffset: { index: 4, length: 3 }, count: 2 });
  await expect(content(page)).toHaveText('bar bar'); await page.evaluate(() => window.editor.undo()); await expect(content(page)).toHaveText('foo foo');
});

test('unreported same-length text edits are refreshed before navigating or replacing', async ({ page }) => {
  await initialize(page, '<p>cat cat</p>');
  const result = await page.evaluate(() => {
    window.searchAPI.setQuery('cat'); window.editor.surface.querySelector('p')!.firstChild!.textContent = 'dog cat';
    window.searchAPI.select(0); const offset = window.editor.getSelection(); const selected = window.getSelection()?.toString();
    return { offset, selected, count: window.searchAPI.replaceAll('fox') };
  });
  expect(result).toEqual({ offset: { index: 4, length: 3 }, selected: 'cat', count: 1 }); await expect(content(page)).toHaveText('dog fox');
});

test('invalid query/options/replacement/index reject atomically and preserve state/history', async ({ page }) => {
  await initialize(page); await query(page, 'one'); const before = await content(page).innerHTML(); const saved = await state(page);
  const results = await page.evaluate(() => {
    const attempts = [() => window.searchAPI.setQuery('x'.repeat(1001)), () => window.searchAPI.setQuery('one\ntwo'), () => window.searchAPI.setQuery('one', { wholeWord: 'yes' } as never), () => window.searchAPI.select(-1), () => window.searchAPI.select(100), () => window.searchAPI.replaceCurrent('a\nb'), () => window.searchAPI.replaceAll('x'.repeat(20001))];
    return attempts.map((attempt) => { try { attempt(); return false; } catch { return true; } });
  }); expect(results.every(Boolean)).toBe(true); expect(await state(page)).toEqual(saved); expect(await content(page).innerHTML()).toBe(before); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('10000-match cap rejects query and expanding replacement without partial mutation', async ({ page }) => {
  await initialize(page, `<p>${'a'.repeat(10001)}</p>`); await query(page, 'absent'); const previous = await state(page);
  expect(await page.evaluate(() => { try { window.searchAPI.setQuery('a'); } catch (error) { return String(error); } })).toContain('10000'); expect(await state(page)).toEqual(previous);
  await page.evaluate(() => { window.editor.setHTML(`<p>${'a'.repeat(10000)}</p>`); window.searchAPI.setQuery('a'); });
  expect((await state(page)).matches).toHaveLength(10000);
  expect(await page.evaluate(() => { try { window.searchAPI.replaceAll('aa'); } catch (error) { return String(error); } })).toContain('10000');
  expect((await state(page)).matches).toHaveLength(10000); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await content(page).textContent()).toHaveLength(10000);
});

test('oversized replacement rejects before allocating the planned document', async ({ page }) => {
  await initialize(page, `<p>${'a'.repeat(10000)}</p>`); await query(page, 'a');
  expect(await page.evaluate(() => { try { window.searchAPI.replaceAll('x'.repeat(1000)); } catch (error) { return String(error); } })).toContain('5000000');
  expect(await content(page).textContent()).toBe('a'.repeat(10000)); expect((await state(page)).matches).toHaveLength(10000);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false); expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('passive overflow preserves edits and query, reports error and auto-recovers', async ({ page }) => {
  await initialize(page, '<p>a</p>'); await query(page, 'a');
  await page.evaluate(() => window.editor.setHTML(`<p>${'a'.repeat(10001)}</p>`));
  expect(await content(page).textContent()).toHaveLength(10001); expect(await state(page)).toMatchObject({ query: 'a', matches: [], current: -1, error: 'match-limit' });
  expect(await page.evaluate(() => { try { window.searchAPI.replaceAll('b'); } catch (error) { return String(error); } })).toContain('10000');
  await page.evaluate(() => window.editor.setHTML('<p>a a</p>')); expect((await state(page)).matches).toHaveLength(2); expect((await state(page)).error).toBeUndefined();
});

test('subscriptions expose deep snapshots, survive reentrant query changes and clean up', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    let changed = false; const seen: string[] = [];
    const stopFirst = window.searchAPI.subscribe((state) => { if (!changed && state.query === 'one') { changed = true; window.searchAPI.setQuery('ONE', { caseSensitive: true }); } });
    const stopSecond = window.searchAPI.subscribe((state) => { seen.push(state.query); state.matches[0].text = 'mutated'; state.options.caseSensitive = false; });
    window.searchAPI.setQuery('one'); const actual = window.searchAPI.getState(); stopFirst(); stopSecond(); stopSecond();
    return { seen, actual };
  })).toEqual({ seen: ['ONE', 'ONE'], actual: { query: 'ONE', options: { caseSensitive: true, wholeWord: false }, matches: [{ index: 8, length: 3, text: 'ONE' }], current: 0 } });
  await page.evaluate(() => { window.stopSearch(); window.searchEvents = []; window.searchAPI.clear(); }); expect(await page.evaluate(() => window.searchEvents)).toEqual([]);
});

test('reusing plugin in two instances isolates query, documents and disposal', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const plugin = window.createSearch(); const hosts = [document.createElement('div'), document.createElement('div')]; hosts.forEach((host) => document.body.append(host));
    const first = window.createEditor(hosts[0], { value: '<p>first first</p>', plugins: [plugin] }); const second = window.createEditor(hosts[1], { value: '<p>second second</p>', plugins: [plugin] });
    const a = window.searchCommands(first); const b = window.searchCommands(second); a.setQuery('first'); b.setQuery('second');
    const stop = a.subscribe(() => {}); first.destroy(); let disposed = false; try { a.getState(); } catch { disposed = true; } stop();
    const count = b.replaceAll('other'); const result = { disposed, count, text: second.getText(), query: b.getState().query }; second.destroy(); hosts.forEach((host) => host.remove()); return result;
  })).toEqual({ disposed: true, count: 2, text: 'other other', query: 'second' });
});


test('search entry and factory can be evaluated without browser globals', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', 'const { search } = await import("@morfira-dev/wysiwyg/plugins/search"); process.stdout.write(search().name);'], { cwd: process.cwd(), encoding: 'utf8' });
  expect(output).toBe('search');
});
