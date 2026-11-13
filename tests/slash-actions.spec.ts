import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SlashActions, SlashOption, SuggestionController } from '@morfira-dev/wysiwyg/plugins/slash';

declare global { interface Window {
  structuralSlash: SuggestionController<SlashOption>;
  structuralItems: unknown[];
  resolveStructural: (items: readonly SlashOption[]) => void;
  structuralSignals: AbortSignal[];
} }

const initialize = async (page: Page, action = 'heading2', html = '<p>/cmd</p>', mode = 'normal') => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ command, value, behavior }) => {
    window.dispose(); const host = document.createElement('div'); host.className = 'structural-slash-test'; document.body.append(host);
    window.structuralItems = [{ id: 'result', label: command, action: command }]; window.structuralSignals = [];
    const actions: SlashActions = {
      ...window.createSlashActions(),
      table: (editor) => window.tableCommands(editor).insert(2, 3),
      custom: (editor) => editor.getPlugin<{ run: () => void }>('custom')!.run(),
      noop: () => {},
      failing: (editor) => { editor.format('header', 3); throw new Error('Action failed'); },
      swallowed: (editor) => { try { editor.transact(() => { editor.format('header', 3); throw new Error('Inner failed'); }); } catch { /* Outer transaction must remain poisoned. */ } },
      asynchronous: (editor) => { editor.format('header', 3); return Promise.reject(new Error('Async actions are unsupported')); },
    };
    const plugin = window.createSlash({ actions, debounceMs: 0, provide: ({ signal }) => {
      window.structuralSignals.push(signal);
      if (behavior === 'deferred') return new Promise<readonly SlashOption[]>((resolve) => { window.resolveStructural = resolve; });
      return window.structuralItems as SlashOption[];
    } });
    // The registry must be copied by the factory, not observed live afterward.
    if (behavior === 'registry') actions.heading2 = () => { throw new Error('Changed registry leaked'); };
    window.editor = window.createEditor(host, { value, plugins: [
      window.createTables(),
      { name: 'custom', setup: (editor) => editor.providePlugin('custom', { run: () => { editor.format('header', 4); editor.format('align', 'center'); } }) },
      plugin,
    ] });
    window.structuralSlash = window.slashCommands(window.editor); window.changes = []; window.editor.subscribe((change) => window.changes.push(change));
    const text = window.editor.surface.textContent ?? ''; window.editor.setSelection(text.indexOf('/cmd') + 4);
  }, { command: action, value: html, behavior: mode });
};
const surface = (page: Page) => page.locator('.structural-slash-test .mw-content');
const open = async (page: Page) => {
  expect(await page.evaluate(() => window.structuralSlash.open())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.structuralSlash.getState().status)).toBe('ready');
};
const choose = (page: Page) => page.evaluate(() => window.structuralSlash.choose('result'));

for (const [action, selector] of [
  ['paragraph', 'p'], ['heading1', 'h1'], ['heading2', 'h2'], ['heading3', 'h3'], ['heading4', 'h4'], ['heading5', 'h5'], ['heading6', 'h6'],
  ['bulletList', 'ul > li'], ['orderedList', 'ol > li'], ['blockquote', 'blockquote'], ['codeBlock', 'pre'],
]) test(`${action} removes the slash token and preserves one undo/redo operation with live input`, async ({ page }) => {
  await initialize(page, action); await open(page); expect(await choose(page)).toBe(true);
  await expect(surface(page).locator(selector)).toHaveCount(1); await expect(surface(page)).toHaveText('');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  const converted = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo()); await expect(surface(page)).toHaveText('/cmd');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 4, length: 0 });
  expect(await page.evaluate(() => window.structuralSlash.getState().status)).toBe('closed');
  await page.evaluate(() => window.editor.redo()); expect(await page.evaluate(() => window.editor.getHTML())).toBe(converted);
  await page.keyboard.type('hello'); await expect(surface(page).locator(selector)).toHaveText('hello');
});

test('action keeps marked suffix, adjacent content and caret and emits only the final document', async ({ page }) => {
  const original = '<p>Before</p><p><strong>/c</strong>md<em> suffix</em></p><p>After</p>';
  await initialize(page, 'heading2', original); await open(page); await choose(page);
  await expect(surface(page).locator('h2 em')).toHaveText(' suffix'); await expect(surface(page).locator('p')).toHaveText(['Before', 'After']);
  expect(await page.evaluate(() => window.changes.map((change) => change.html))).toEqual([await page.evaluate(() => window.editor.getHTML())]);
  await page.keyboard.type('start'); await expect(surface(page).locator('h2')).toHaveText('start suffix');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); }); expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('list action in a merged table cell retains grid geometry and neighboring cell content', async ({ page }) => {
  const html = '<table><tbody><tr><td rowspan="2"><p>/cmd</p><p>Retained</p></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table><p>Tail</p>';
  await initialize(page, 'bulletList', html); const original = await page.evaluate(() => window.editor.getHTML()); await open(page); await choose(page);
  await expect(surface(page).locator('td[rowspan="2"] ul li')).toHaveCount(1); await expect(surface(page).locator('td[rowspan="2"] p')).toHaveText('Retained');
  await expect(surface(page).locator('td')).toHaveCount(3); await expect(surface(page).locator('td').nth(1)).toHaveText('A'); await expect(surface(page).locator('td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo()); expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('table command is an opt-in callback and inserts one undoable table with its first-cell caret', async ({ page }) => {
  await initialize(page, 'table'); await open(page); await choose(page);
  await expect(surface(page).locator('td')).toHaveCount(6); expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.keyboard.type('Cell'); await expect(surface(page).locator('td').first()).toHaveText('Cell');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); }); await expect(surface(page)).toHaveText('/cmd'); await expect(surface(page).locator('table')).toHaveCount(0);
});

test('failed nested-table action rolls back the original token, selection, history and neighboring merged cell', async ({ page }) => {
  await initialize(page, 'table', '<table><tbody><tr><td colspan="2"><p>/cmd</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>');
  const before = await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() })); await open(page);
  expect(await page.evaluate(() => { try { window.structuralSlash.choose('result'); return ''; } catch (error) { return String(error); } })).toContain('Nested tables');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false); expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('custom plugin commands compose atomically without event-bus mutation RPC', async ({ page }) => {
  await initialize(page, 'custom'); await open(page); await choose(page);
  await expect(surface(page).locator('h4')).toHaveCSS('text-align', 'center'); expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo()); await expect(surface(page)).toHaveText('/cmd'); await expect(surface(page).locator('h4')).toHaveCount(0);
});

for (const action of ['failing', 'swallowed', 'asynchronous']) test(`${action} action commits no partial mutation or history`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page, action); await open(page);
  expect(await page.evaluate(() => { try { window.structuralSlash.choose('result'); return false; } catch { return true; } })).toBe(true);
  await expect(surface(page)).toHaveText('/cmd'); await expect(surface(page).locator('h3')).toHaveCount(0);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false); expect(await page.evaluate(() => window.changes.length)).toBe(0);
  expect(await page.evaluate(() => window.structuralSlash.getState().status)).toBe('closed'); await page.waitForTimeout(20); expect(errors).toEqual([]);
});

test('no-op command still consumes the accepted token and can be undone', async ({ page }) => {
  await initialize(page, 'noop'); await open(page); expect(await choose(page)).toBe(true); await expect(surface(page)).toHaveText('');
  expect(await page.evaluate(() => window.changes.length)).toBe(1); await page.evaluate(() => window.editor.undo()); await expect(surface(page)).toHaveText('/cmd');
});

test('factory copies the registry and validates names and callback values before setup', async ({ page }) => {
  await initialize(page, 'heading2', '<p>/cmd</p>', 'registry'); await open(page); await choose(page); await expect(surface(page).locator('h2')).toHaveCount(1);
  expect(await page.evaluate(() => [null, [], { 'bad name': () => {} }, { valid: 'not a callback' }].map((actions) => {
    try { window.createSlash({ provide: () => [], actions: actions as unknown as SlashActions }); return false; } catch { return true; }
  }))).toEqual([true, true, true, true]);
});

test('missing, ambiguous, unknown and callback provider actions reject the whole result', async ({ page }) => {
  await initialize(page);
  for (const payload of [{}, { action: 'missing' }, { action: 'heading2', text: 'both' }, { action: '' }, { action: 42 }]) {
    await page.evaluate((item) => { window.structuralItems = [{ id: 'valid', label: 'Valid', text: 'Text' }, { id: 'bad', label: 'Bad', ...item }]; window.structuralSlash.close(); window.structuralSlash.open(); }, payload);
    await expect.poll(() => page.evaluate(() => window.structuralSlash.getState().error)).toBe('invalid-results');
    expect(await choose(page)).toBe(false); await expect(surface(page)).toHaveText('/cmd');
  }
  await page.evaluate(() => { window.structuralItems = [{ id: 'bad', label: 'Bad', action: () => {} }]; window.structuralSlash.close(); window.structuralSlash.open(); });
  await expect.poll(() => page.evaluate(() => window.structuralSlash.getState().error)).toBe('invalid-results');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('deferred action provider cannot choose after readonly cancellation or external replacement', async ({ page }) => {
  await initialize(page, 'heading2', '<p>/cmd</p>', 'deferred');
  await page.evaluate(() => window.structuralSlash.open()); await expect.poll(() => page.evaluate(() => window.structuralSignals.length)).toBe(1);
  await page.evaluate(() => { window.editor.setReadOnly(true); window.resolveStructural([{ id: 'result', label: 'Heading', action: 'heading2' }]); });
  await expect.poll(() => page.evaluate(() => window.structuralSignals[0].aborted)).toBe(true);
  expect(await choose(page)).toBe(false); await expect(surface(page)).toHaveText('/cmd');
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.focus(); window.editor.setSelection(4); });
  expect(await page.evaluate(() => window.structuralSlash.open())).toBe(true); await expect.poll(() => page.evaluate(() => window.structuralSignals.length)).toBe(2);
  await page.evaluate(() => { window.editor.setHTML('<p>External</p>'); window.resolveStructural([{ id: 'result', label: 'Heading', action: 'heading2' }]); });
  expect(await choose(page)).toBe(false); await expect(surface(page)).toHaveText('External');
});

for (const adapter of ['vue', 'react', 'svelte']) test(`${adapter} controlled structural slash preserves final feedback, history and following input`, async ({ page }) => {
  await page.goto(`/?adapter=${adapter}&suggestions=1`);
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(() => window.editor.setSelection(0, window.editor.surface.textContent!.length));
  await page.keyboard.type('/h');
  await expect.poll(() => page.evaluate(() => window.slashCommands(window.editor).getState().status)).toBe('ready');
  const count = await page.evaluate(() => window.changes.length);
  expect(await page.evaluate(() => window.slashCommands(window.editor).choose('heading'))).toBe(true);
  await expect(page.locator('.mw-content h2')).toHaveCount(1);
  expect(await page.evaluate(() => window.changes.length)).toBe(count + 1);
  await page.keyboard.type('Title');
  await expect(page.locator('.mw-content h2')).toHaveText('Title');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  await expect(page.getByRole('textbox')).toHaveText('/h');
  await page.evaluate(() => window.editor.redo());
  await expect(page.locator('.mw-content h2')).toHaveCount(1);
  await page.keyboard.type('Again');
  await expect(page.locator('.mw-content h2')).toHaveText('Again');
  const updates = await page.evaluate(() => window.changes.length);
  await page.getByRole('button', { name: 'Update value', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveText('External update');
  expect(await page.evaluate(() => window.changes.length)).toBe(updates);
  await page.evaluate(() => window.dispose());
  await expect(page.locator('.mw-editor')).toHaveCount(0);
});
