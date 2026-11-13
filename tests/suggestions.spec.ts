import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { MentionOption, SlashOption, SuggestionController, SuggestionState } from '@morfira-dev/wysiwyg/plugins/suggestions';

interface Pending<T> { query: string; signal: AbortSignal; limit: number; resolve: (items: readonly T[]) => void; reject: (error: unknown) => void; }
interface Settings { deferred?: boolean; throws?: boolean; debounceMs?: number; maxItems?: number; minQueryLength?: number; markdown?: boolean; }
declare global { interface Window {
  mentionsAPI: SuggestionController<MentionOption>; slashAPI: SuggestionController<SlashOption>;
  mentionRequests: Pending<MentionOption>[]; slashRequests: Pending<SlashOption>[]; suggestionPeople: MentionOption[];
  mentionEvents: SuggestionState<MentionOption>[]; heldMentionAPI: SuggestionController<MentionOption>;
} }
const initialize = async (page: Page, html = '<p><br></p>', settings: Settings = {}) => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ value, options }) => {
    window.dispose(); const host = document.createElement('div'); host.className = 'suggestions-core-test'; document.body.append(host);
    window.mentionRequests = []; window.slashRequests = []; window.mentionEvents = [];
    window.suggestionPeople = [{ id: 'anna', label: 'Anna Smith', description: 'Writer' }, { id: 'boris', label: 'Борис' }];
    const provideMentions = (request: { query: string; signal: AbortSignal; limit: number }) => {
      if (options.throws) throw new Error('Provider failed');
      if (options.deferred) return new Promise<readonly MentionOption[]>((resolve, reject) => window.mentionRequests.push({ ...request, resolve, reject }));
      window.mentionRequests.push({ ...request, resolve: () => {}, reject: () => {} }); return window.suggestionPeople;
    };
    const provideSlash = (request: { query: string; signal: AbortSignal; limit: number }) => {
      if (options.deferred) return new Promise<readonly SlashOption[]>((resolve, reject) => window.slashRequests.push({ ...request, resolve, reject }));
      window.slashRequests.push({ ...request, resolve: () => {}, reject: () => {} }); return [{ id: 'signature', label: 'Signature', text: 'Best regards' }];
    };
    const plugins = [window.createMentions({ provide: provideMentions, debounceMs: options.debounceMs ?? 0, maxItems: options.maxItems, minQueryLength: options.minQueryLength }), window.createSlash({ provide: provideSlash, debounceMs: options.debounceMs ?? 0 })];
    if (options.markdown) plugins.push(window.createMarkdownShortcuts());
    window.editor = window.createEditor(host, { value, plugins }); window.mentionsAPI = window.mentionCommands(window.editor); window.slashAPI = window.slashCommands(window.editor);
    window.mentionsAPI.subscribe((state) => window.mentionEvents.push(state)); window.changes = []; window.editor.subscribe((change) => window.changes.push(change));
    window.editor.setSelection(window.editor.surface.textContent!.length);
  }, { value: html, options: settings });
};
const content = (page: Page) => page.locator('.suggestions-core-test .mw-content');
const ready = async (page: Page, kind: 'mention' | 'slash' = 'mention') => expect.poll(() => page.evaluate((type) => (type === 'mention' ? window.mentionsAPI : window.slashAPI).getState().status, kind)).toBe('ready');
const load = async (page: Page, html: string, index?: number) => page.evaluate(({ value, offset }) => { window.mentionsAPI.close(); window.slashAPI.close(); window.editor.setHTML(value); window.editor.setSelection(offset ?? window.editor.surface.textContent!.length); window.changes = []; }, { value: html, offset: index });

// Providers and menus are app-owned; these tests exercise the headless behavior alone.
test('native mention typing, keyboard choice and one-step undo/redo retain plain-text semantics', async ({ page }) => {
  await initialize(page); await page.keyboard.type('@a'); await ready(page);
  expect(await page.evaluate(() => window.mentionsAPI.getState().query)).toBe('a');
  expect(await page.evaluate(() => window.mentionRequests.map((request) => request.query))).toEqual(['a']);
  await page.evaluate(() => { window.changes = []; window.mentionsAPI.move(1); });
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await expect(content(page)).toHaveText('@Anna Smith '); expect(await page.evaluate(() => window.changes.length)).toBe(1);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 12, length: 0 });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>@Anna Smith </p>');
  await page.evaluate(() => window.editor.undo()); await expect(content(page)).toHaveText('@a');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  expect(await page.evaluate(() => window.mentionsAPI.getState().status)).toBe('closed');
  expect(await page.evaluate(() => window.mentionRequests.length)).toBe(1);
  await page.evaluate(() => window.editor.redo()); await page.keyboard.type('next'); await expect(content(page)).toHaveText('@Anna Smith next');
});

test('slash inserts literal snippets in one transaction even with Markdown enabled', async ({ page }) => {
  await initialize(page, '<p>/sig</p>', { deferred: true, markdown: true });
  expect(await page.evaluate(() => window.slashAPI.open())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.slashRequests.length)).toBe(1);
  await page.evaluate(() => window.slashRequests[0].resolve([{ id: 'literal', label: 'Template', text: '# Heading <b>$&</b>' }])); await ready(page, 'slash');
  await page.evaluate(() => { window.changes = []; window.slashAPI.choose('literal'); });
  await expect(content(page)).toHaveText('# Heading <b>$&</b>'); await expect(content(page).locator('h1,b,strong')).toHaveCount(0);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo()); await expect(content(page)).toHaveText('/sig');
  expect(await page.evaluate(() => window.slashAPI.getState().status)).toBe('closed');
});

test('default mention minimum waits for a letter while slash opens on its empty query', async ({ page }) => {
  await initialize(page); await page.keyboard.type('@');
  expect(await page.evaluate(() => window.mentionsAPI.getState().status)).toBe('closed'); expect(await page.evaluate(() => window.mentionRequests.length)).toBe(0);
  await load(page, '<p><br></p>'); await page.keyboard.type('/'); await ready(page, 'slash');
  expect(await page.evaluate(() => window.slashRequests.map((request) => request.query))).toEqual(['']);
  await page.keyboard.press('Enter'); await expect(content(page)).toHaveText('Best regards');
});

test('Unicode query crossing inline marks preserves the starting format, suffix and selection history', async ({ page }) => {
  await initialize(page, '<p>Before <strong>@Бо</strong>ри́с<em> tail</em></p>', { deferred: true });
  await page.evaluate(() => window.editor.setSelection(14)); expect(await page.evaluate(() => window.mentionsAPI.open())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(1);
  expect(await page.evaluate(() => window.mentionRequests[0].query)).toBe('Бори́с');
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.mentionRequests[0].resolve([{ id: 'person-42', label: 'Борис' }])); await ready(page);
  await page.evaluate(() => window.mentionsAPI.choose('person-42'));
  await expect(content(page).locator('strong')).toHaveText('@Борис '); await expect(content(page).locator('em')).toHaveText(' tail');
  await expect(content(page)).toHaveText('Before @Борис  tail');
  expect(await page.evaluate(() => JSON.stringify(window.editor.getJSON()))).not.toContain('person-42');
  expect(await page.evaluate(() => window.editor.getHTML())).not.toMatch(/data-mention|contenteditable/);
  await page.evaluate(() => window.editor.undo()); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 14, length: 0 });
});

test('trigger boundaries exclude email/URL/code/caption and slash inside existing structure', async ({ page }) => {
  await initialize(page);
  const cases: [string, 'mention' | 'slash'][] = [
    ['<p>name@anna</p>', 'mention'], ['<p>https://host/@anna</p>', 'mention'], ['<p><a href="/x">@anna</a></p>', 'mention'],
    ['<p><code>@anna</code></p>', 'mention'], ['<pre>@anna</pre>', 'mention'], ['<figure><figcaption>@anna</figcaption></figure>', 'mention'],
    ['<p>@a<br>b</p>', 'mention'], ['<p>@a<img src="/logo.svg">b</p>', 'mention'],
    ['<h2>/sig</h2>', 'slash'], ['<ul><li>/sig</li></ul>', 'slash'], ['<blockquote>/sig</blockquote>', 'slash'], ['<p>before /sig</p>', 'slash'],
  ];
  for (const [html, kind] of cases) { await load(page, html); expect(await page.evaluate((type) => (type === 'mention' ? window.mentionsAPI : window.slashAPI).open(), kind), html).toBe(false); }
  expect(await page.evaluate(() => window.mentionRequests.length + window.slashRequests.length)).toBe(0);
  for (const html of ['<p>(@a</p>', '<h2>@a</h2>', '<blockquote>@a</blockquote>', '<ul><li>@a</li></ul>']) {
    await load(page, html); expect(await page.evaluate(() => window.mentionsAPI.open()), html).toBe(true); await ready(page);
  }
});

test('internal-token caret and noncollapsed selection cannot open an insertion target', async ({ page }) => {
  await initialize(page, '<p>@anna</p>'); await page.evaluate(() => window.editor.setSelection(3));
  expect(await page.evaluate(() => window.mentionsAPI.open())).toBe(false);
  await page.evaluate(() => window.editor.setSelection(0, 5)); expect(await page.evaluate(() => window.mentionsAPI.open())).toBe(false);
  await load(page, '<p>/signature</p>', 4); expect(await page.evaluate(() => window.slashAPI.open())).toBe(false);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('native deletion updates lookup and whitespace dismissal keeps the typed token', async ({ page }) => {
  await initialize(page); await page.keyboard.type('@ab'); await ready(page);
  await page.keyboard.press('Backspace'); await ready(page);
  expect(await page.evaluate(() => window.mentionsAPI.getState().query)).toBe('a');
  expect(await page.evaluate(() => window.mentionRequests.at(-1)!.query)).toBe('a');
  await page.keyboard.press('Space'); await expect.poll(() => page.evaluate(() => window.mentionsAPI.getState().status)).toBe('closed');
  await expect(content(page)).toHaveText('@a '); const requests = await page.evaluate(() => window.mentionRequests.length);
  await page.keyboard.press('ArrowLeft'); expect(await page.evaluate(() => window.mentionRequests.length)).toBe(requests);
});

test('latest asynchronous response wins and stale result IDs cannot be chosen', async ({ page }) => {
  await initialize(page, '<p><br></p>', { deferred: true }); await page.keyboard.type('@a');
  await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(1);
  await page.keyboard.type('b'); await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(2);
  expect(await page.evaluate(() => window.mentionRequests[0].signal.aborted)).toBe(true);
  await page.evaluate(() => { window.mentionRequests[0].resolve([{ id: 'old', label: 'Old' }]); window.mentionRequests[1].resolve([{ id: 'new', label: 'New' }]); }); await ready(page);
  expect(await page.evaluate(() => window.mentionsAPI.getState().items.map((item) => item.id))).toEqual(['new']);
  expect(await page.evaluate(() => window.mentionsAPI.choose('old'))).toBe(false); await expect(content(page)).toHaveText('@ab');
  expect(await page.evaluate(() => window.mentionsAPI.choose('new'))).toBe(true); await expect(content(page)).toHaveText('@New ');
});

test('debounce invokes only the latest native query after its configured delay', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await initialize(page, '<p><br></p>', { debounceMs: 100 });
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
  await page.keyboard.type('@abc'); expect(await page.evaluate(() => window.mentionRequests.length)).toBe(0);
  await page.clock.runFor(99); expect(await page.evaluate(() => window.mentionRequests.length)).toBe(0);
  await page.clock.runFor(1); await ready(page);
  expect(await page.evaluate(() => window.mentionRequests.map((request) => request.query))).toEqual(['abc']);
});

for (const cause of ['close', 'readonly', 'external', 'selection', 'composition', 'history', 'paste'] as const) test(`pending request cancels after ${cause} and never inserts a late result`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page, '<p>@a</p>', { deferred: true }); await page.evaluate(() => window.mentionsAPI.open());
  await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(1);
  if (cause === 'history') await page.keyboard.press('Control+z');
  else await page.evaluate((action) => {
    if (action === 'close') window.mentionsAPI.close();
    if (action === 'readonly') window.editor.setReadOnly(true);
    if (action === 'external') window.editor.setHTML('<p>External</p>');
    if (action === 'selection') window.editor.setSelection(0);
    if (action === 'composition') { window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'a' })); window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'a' })); }
    if (action === 'paste') { const data = new DataTransfer(); data.setData('text/plain', '@b'); window.editor.surface.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })); }
  }, cause);
  await expect.poll(() => page.evaluate(() => window.mentionsAPI.getState().status)).toBe('closed');
  expect(await page.evaluate(() => window.mentionRequests[0].signal.aborted)).toBe(true);
  await page.evaluate(() => window.mentionRequests[0].resolve([{ id: 'late', label: 'Late' }]));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => window.mentionsAPI.choose('late'))).toBe(false);
  expect(await content(page).textContent()).not.toContain('Late'); expect(errors).toEqual([]);
});

test('late rejection after cancellation is handled without unhandled errors', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page, '<p>@a</p>', { deferred: true }); await page.evaluate(() => window.mentionsAPI.open());
  await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(1);
  await page.evaluate(() => { window.mentionsAPI.close(); window.mentionRequests[0].reject(new Error('Late failure')); });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => window.mentionsAPI.getState().status)).toBe('closed'); expect(errors).toEqual([]);
});

test('provider exceptions and malformed results are recoverable state errors with no document changes', async ({ page }) => {
  await initialize(page, '<p>@a</p>', { throws: true }); await page.evaluate(() => window.mentionsAPI.open());
  await expect.poll(() => page.evaluate(() => window.mentionsAPI.getState().error)).toBe('provider-error');
  await expect(content(page)).toHaveText('@a'); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await initialize(page, '<p>@a</p>', { deferred: true });
  const invalid: unknown[] = [null, {}, [{ id: '', label: 'Empty ID' }], [{ id: 'x', label: '' }], [{ id: 'x', label: 'x\ny' }], [{ id: 'x', label: 'A' }, { id: 'x', label: 'B' }], [{ id: 'x'.repeat(257), label: 'A' }], [{ id: 'x', label: 'a'.repeat(201) }], Array.from({ length: 1001 }, (_, index) => ({ id: String(index), label: 'A' }))];
  for (const result of invalid) {
    const count = await page.evaluate(() => window.mentionRequests.length);
    await page.evaluate(() => { window.mentionsAPI.close(); window.editor.setSelection(2); window.mentionsAPI.open(); });
    await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(count + 1);
    await page.evaluate((items) => window.mentionRequests.at(-1)!.resolve(items as readonly MentionOption[]), result);
    await expect.poll(() => page.evaluate(() => window.mentionsAPI.getState().error)).toBe('invalid-results');
    await expect(content(page)).toHaveText('@a'); expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  }
});

test('display truncation validates hidden results and provider snapshots do not leak application objects', async ({ page }) => {
  await initialize(page, '<p>@a</p>', { deferred: true, maxItems: 1 }); await page.evaluate(() => window.mentionsAPI.open());
  await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(1);
  expect(await page.evaluate(() => window.mentionRequests[0].limit)).toBe(1);
  await page.evaluate(() => { window.suggestionPeople = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]; window.mentionRequests[0].resolve(window.suggestionPeople); }); await ready(page);
  expect(await page.evaluate(() => window.mentionsAPI.getState().items.map((item) => item.id))).toEqual(['a']);
  await page.evaluate(() => { const state = window.mentionsAPI.getState(); (state.items[0] as MentionOption).label = 'Mutated'; state.query = 'Mutated'; window.suggestionPeople[0].label = 'Application mutation'; });
  expect(await page.evaluate(() => window.mentionsAPI.getState().items[0].label)).toBe('A');
  await page.evaluate(() => { window.mentionsAPI.close(); window.mentionsAPI.open(); }); await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(2);
  await page.evaluate(() => window.mentionRequests[1].resolve([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'b', label: 'Duplicate hidden' }]));
  await expect.poll(() => page.evaluate(() => window.mentionsAPI.getState().error)).toBe('invalid-results');
});

test('same-value controlled-style feedback preserves requests while identical DOM rebuilds never use stale nodes', async ({ page }) => {
  await initialize(page, '<p>@a</p>', { deferred: true }); await page.evaluate(() => window.mentionsAPI.open());
  await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(1);
  await page.evaluate(() => window.editor.setHTML(window.editor.getHTML()));
  expect(await page.evaluate(() => window.mentionRequests[0].signal.aborted)).toBe(false); expect(await page.evaluate(() => window.mentionRequests.length)).toBe(1);
  await page.evaluate(() => window.mentionRequests[0].resolve([{ id: 'anna', label: 'Anna' }])); await ready(page);
  const result = await page.evaluate(() => { window.editor.setSelection(0, 2); window.editor.format('italic', false); window.editor.setSelection(2); const chosen = window.mentionsAPI.choose('anna'); return { chosen, text: window.editor.surface.textContent, status: window.mentionsAPI.getState().status }; });
  expect(result.text).toBe(result.chosen ? '@Anna ' : '@a'); expect(result.status).toBe('closed');
});

test('plain-text mention labels and slash snippets retain merged cells and reject executable markup interpretation', async ({ page }) => {
  await initialize(page, '<table><tbody><tr><td rowspan="2"><p>@a</p></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><p>Tail</p>', { deferred: true });
  await page.evaluate(() => { window.editor.setSelection(2); window.mentionsAPI.open(); }); await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(1);
  await page.evaluate(() => window.mentionRequests[0].resolve([{ id: '" unsafe selector', label: '<img src=x onerror=evil()>' }])); await ready(page);
  await page.evaluate(() => window.mentionsAPI.choose('" unsafe selector'));
  await expect(content(page).locator('td[rowspan="2"]')).toHaveText('@<img src=x onerror=evil()> '); await expect(content(page).locator('img')).toHaveCount(0); await expect(content(page).locator('td')).toHaveCount(3);
  await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('td[rowspan="2"]')).toHaveText('@a');
  await load(page, '<table><tbody><tr><td rowspan="2"><p>/s</p></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><p>Tail</p>', 2);
  await page.evaluate(() => window.slashAPI.open()); await expect.poll(() => page.evaluate(() => window.slashRequests.length)).toBe(1);
  await page.evaluate(() => window.slashRequests[0].resolve([{ id: 's', label: 'Snippet', text: 'Literal <script>text</script>' }])); await ready(page, 'slash'); await page.evaluate(() => window.slashAPI.choose('s'));
  await expect(content(page).locator('td[rowspan="2"]')).toHaveText('Literal <script>text</script>'); await expect(content(page).locator('script')).toHaveCount(0); await expect(content(page).locator('p').last()).toHaveText('Tail');
});

test('query caps and invalid controller/factory arguments reject without document mutations', async ({ page }) => {
  await initialize(page, `<p>@${'a'.repeat(100)}</p>`); expect(await page.evaluate(() => window.mentionsAPI.open())).toBe(true); await ready(page);
  await load(page, `<p>@${'a'.repeat(101)}</p>`); expect(await page.evaluate(() => window.mentionsAPI.open())).toBe(false);
  expect(await page.evaluate(() => {
    const invalid = [{ provide: undefined }, { provide: () => [], maxItems: 0 }, { provide: () => [], maxItems: 101 }, { provide: () => [], debounceMs: -1 }, { provide: () => [], minQueryLength: 101 }];
    return invalid.every((options) => { try { window.createMentions(options as never); } catch { return true; } return false; });
  })).toBe(true);
  expect(await page.evaluate(() => { try { window.mentionsAPI.move(0 as never); } catch { return true; } return false; })).toBe(true);
  expect(await page.evaluate(() => { try { window.mentionsAPI.choose(null as never); } catch { return true; } return false; })).toBe(true);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('snapshots, unsubscribe and disposal hooks remain independent and cleanup survives a throwing hook', async ({ page }) => {
  await initialize(page, '<p>@a</p>', { deferred: true });
  expect(await page.evaluate(() => window.mentionEvents.length)).toBe(0);
  await page.evaluate(() => window.mentionsAPI.open()); await expect.poll(() => page.evaluate(() => window.mentionRequests.length)).toBe(1);
  expect(await page.evaluate(() => {
    let disposed = 0; const stop = window.mentionsAPI.onDispose(() => { disposed += 100; }); stop(); stop();
    window.mentionsAPI.onDispose(() => { throw new Error('Hook failure'); }); window.mentionsAPI.onDispose(() => { disposed++; });
    window.heldMentionAPI = window.mentionsAPI; let failed = false; try { window.editor.destroy(); } catch { failed = true; }
    let closed = false; try { window.heldMentionAPI.getState(); } catch { closed = true; }
    return { disposed, failed, closed, aborted: window.mentionRequests[0].signal.aborted };
  })).toEqual({ disposed: 1, failed: true, closed: true, aborted: true });
  await page.evaluate(() => window.mentionRequests[0].resolve([{ id: 'late', label: 'Late' }])); await expect(page.locator('.suggestions-core-test .mw-editor')).toHaveCount(0);
});

test('reentrant listeners see fresh snapshots after another listener closes the session', async ({ page }) => {
  await initialize(page, '<p>@a</p>');
  const statuses = await page.evaluate(() => new Promise<string[]>((resolve) => {
    const seen: string[] = [];
    const first = window.mentionsAPI.subscribe((state) => { if (state.status === 'ready') window.mentionsAPI.close(); });
    const second = window.mentionsAPI.subscribe((state) => { seen.push(state.status); if (state.status === 'closed') queueMicrotask(() => { first(); second(); resolve(seen); }); });
    window.mentionsAPI.open();
  }));
  expect(statuses).toContain('loading'); expect(statuses).toContain('closed'); expect(statuses).not.toContain('ready');
  expect(await page.evaluate(() => window.mentionsAPI.getState().status)).toBe('closed'); await expect(content(page)).toHaveText('@a');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('one reusable plugin keeps controller state and teardown independent between editors', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const plugin = window.createMentions({ provide: () => [{ id: 'a', label: 'A' }], debounceMs: 0 });
    const hostA = document.createElement('div'); const hostB = document.createElement('div'); document.body.append(hostA, hostB);
    const first = window.createEditor(hostA, { value: '<p>@a</p>', plugins: [plugin] }); const second = window.createEditor(hostB, { value: '<p>@b</p>', plugins: [plugin] });
    const a = window.mentionCommands(first); const b = window.mentionCommands(second); first.setSelection(2); a.open(); second.setSelection(2); b.open();
    if (b.getState().status !== 'ready') await new Promise<void>((resolve) => { const stop = b.subscribe((state) => { if (state.status === 'ready') { stop(); resolve(); } }); }); first.destroy();
    const result = b.choose('a') && second.getText() === '@A ' && b.getState().status === 'closed'; second.destroy(); hostA.remove(); hostB.remove(); return result;
  })).toBe(true);
});

for (const adapter of ['vue', 'react', 'svelte']) test(`${adapter} controlled feedback, external replacement, readonly and unmount preserve suggestion lifecycle`, async ({ page }) => {
  await page.goto(`/?adapter=${adapter}&suggestions=1`); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => window.editor.setSelection(0, window.editor.surface.textContent!.length)); await page.keyboard.type('@a');
  await expect.poll(() => page.evaluate(() => window.mentionCommands(window.editor).getState().status)).toBe('ready');
  expect(await page.evaluate(() => window.suggestionQueries)).toEqual(['a']);
  await page.evaluate(() => window.mentionCommands(window.editor).choose('anna')); await expect(page.getByRole('textbox')).toHaveText('@Anna Smith ');
  await page.keyboard.type('tail'); await expect(page.getByRole('textbox')).toHaveText('@Anna Smith tail');
  await page.evaluate(() => window.editor.setSelection(0, window.editor.surface.textContent!.length)); await page.keyboard.type('/s');
  await expect.poll(() => page.evaluate(() => window.slashCommands(window.editor).getState().status)).toBe('ready');
  await page.evaluate(() => window.slashCommands(window.editor).choose('signature')); await expect(page.getByRole('textbox')).toHaveText('Best regards');
  const changes = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Update value', exact: true }).click(); await expect(page.getByRole('textbox')).toHaveText('External update');
  expect(await page.evaluate(() => window.changes.length)).toBe(changes);
  await page.evaluate(() => window.editor.setSelection(0, window.editor.surface.textContent!.length)); await page.keyboard.type('@b');
  await expect.poll(() => page.evaluate(() => window.suggestionSignals.length)).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Toggle readonly', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.editor.isReadOnly())).toBe(true);
  expect(await page.evaluate(() => window.mentionCommands(window.editor).getState().status)).toBe('closed'); expect(await page.evaluate(() => window.suggestionSignals.at(-1)!.aborted)).toBe(true);
  await page.evaluate(() => { window.heldMentionAPI = window.mentionCommands(window.editor); window.dispose(); }); await expect(page.locator('.mw-editor')).toHaveCount(0);
  expect(await page.evaluate(() => { try { window.heldMentionAPI.getState(); } catch { return true; } return false; })).toBe(true);
});

test('public factories import in Node without browser globals', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', 'const {mentions}=await import("@morfira-dev/wysiwyg/plugins/mentions"); const {slash}=await import("@morfira-dev/wysiwyg/plugins/slash"); process.stdout.write(String(typeof mentions({provide:()=>[]}).setup)+":"+String(typeof slash({provide:()=>[]}).setup));'], { cwd: process.cwd(), encoding: 'utf8' });
  expect(output).toBe('function:function');
});
