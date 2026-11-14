import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const tableHTML = '<table><tbody><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td></tr></tbody></table><p>After</p>';
const initializeTables = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate((value) => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'localized-editor';
    document.body.append(host);
    const failures: string[] = [];
    window.changes = [];
    window.editor = window.createEditor(host, {
      value,
      plugins: [window.createTables({ onClipboardError: (error) => failures.push(error.message) })],
      onChange: (change) => window.changes.push(change),
    });
    window.editor.providePlugin('localized-failures', failures);
    window.editor.setSelection(1);
  }, tableHTML);
};

const initializeSuggestions = async (page: Page, mode: 'ready' | 'loading' | 'empty' | 'error', pinned = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ mode, pinned }) => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'localized-editor';
    document.body.append(host);
    const provider = { calls: 0 };
    window.changes = [];
    window.editor = window.createEditor(host, {
      value: '<p>@a</p>',
      onChange: (change) => window.changes.push(change),
      plugins: [window.createMentions({ debounceMs: 0, provide: ({ signal }) => {
        provider.calls++;
        if (mode === 'empty') return [];
        if (mode === 'error') throw new Error('Application-private provider failure');
        if (mode === 'loading') return new Promise<[]>((resolve) => {
          if (signal.aborted) resolve([]);
          else signal.addEventListener('abort', () => resolve([]), { once: true });
        });
        return [{ id: 'a', label: 'Alice <b>' }, { id: 'b', label: 'Bob' }];
      } })],
    });
    window.editor.providePlugin('localized-provider', provider);
    const dispose = window.createSuggestionMenu(window.editor, window.mentionCommands(window.editor), pinned ? {
      locale: 'en', labels: { label: 'People <strong>', empty: 'Nobody!' },
    } : {});
    window.editor.providePlugin('localized-dispose', dispose);
    window.editor.setSelection(2);
    window.mentionCommands(window.editor).open();
  }, { mode, pinned });
};

test('table locale changes translate existing controls and preserve merged cells, selection and undo', async ({ page }) => {
  await initializeTables(page);
  await page.evaluate(() => window.editor.insertHTML('X'));
  await page.locator('.localized-editor td').first().click({ button: 'right' });
  const menu = page.locator('.localized-editor .mw-table-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toHaveText('Строка выше');
  const before = await page.evaluate(() => {
    const menu = window.editor.element.querySelector('.mw-table-menu')!;
    window.editor.providePlugin('localized-nodes', { menu, button: menu.firstElementChild });
    return { html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length };
  });
  await page.evaluate(() => window.editor.setLocale('en-US', { 'tables.merge': '<b>Join</b>' }));
  await expect(menu.getByRole('menuitem').first()).toHaveText('Insert row above');
  await expect(menu.getByRole('menuitem', { name: '<b>Join</b>', exact: true })).toBeVisible();
  await expect(menu.locator('b')).toHaveCount(0);
  await expect(menu.getByLabel('Cell color', { exact: true })).toHaveCount(1);
  await expect(page.locator('.localized-editor .mw-table-resize')).toHaveAttribute('aria-label', 'Resize column');
  expect(await page.evaluate(() => {
    const nodes = window.editor.getPlugin<{ menu: Element; button: Element }>('localized-nodes')!;
    return {
      html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length,
      same: nodes.menu === window.editor.element.querySelector('.mw-table-menu') && nodes.button === nodes.menu.firstElementChild,
    };
  })).toEqual({ ...before, same: true });
  await expect(page.locator('.localized-editor td[rowspan="2"]')).toHaveCount(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(tableHTML);
});

test('table clipboard status localizes independently from original diagnostic callback', async ({ page }) => {
  await initializeTables(page);
  await page.evaluate(() => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', 'x\ty');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboard });
    window.editor.surface.dispatchEvent(event);
  });
  const status = page.locator('.localized-editor .mw-table-status');
  await expect(status).toHaveText('Не удалось скопировать или вставить диапазон таблицы.');
  await page.evaluate(() => window.editor.setLocale('en'));
  await expect(status).toHaveText('Unable to copy or paste this table range.');
  await page.evaluate(() => window.editor.setLocale('de-CH', { 'tables.clipboardError': 'Bereich <em>prüfen</em>' }));
  await expect(status).toHaveText('Bereich <em>prüfen</em>');
  await expect(status.locator('em')).toHaveCount(0);
  expect(await page.evaluate(() => window.editor.getPlugin<string[]>('localized-failures'))).toEqual(['Paste would split an existing merged cell. Select its complete area first.']);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(tableHTML);
});

test('suggestion menu inherits editor locale and updates text without replacing options or restarting lookup', async ({ page }) => {
  await initializeSuggestions(page, 'ready');
  await expect.poll(() => page.evaluate(() => window.mentionCommands(window.editor).getState().status)).toBe('ready');
  const box = page.getByRole('listbox');
  await expect(box).toHaveAttribute('aria-label', 'Подсказки');
  await expect(box.getByRole('option').first()).toHaveText('Alice <b>');
  await page.keyboard.press('ArrowDown');
  const before = await page.evaluate(() => {
    const box = window.editor.element.querySelector('[role="listbox"]')!;
    window.editor.providePlugin('localized-row', box.lastElementChild);
    return { html: window.editor.getHTML(), selection: window.editor.getSelection(), active: window.editor.surface.getAttribute('aria-activedescendant') };
  });
  await page.evaluate(() => window.editor.setLocale('en-GB'));
  await expect(box).toHaveAttribute('aria-label', 'Suggestions');
  await expect(page.locator('.mw-suggestions-status')).toHaveText('2 suggestions');
  expect(await page.evaluate(() => ({
    html: window.editor.getHTML(), selection: window.editor.getSelection(), active: window.editor.surface.getAttribute('aria-activedescendant'),
    same: window.editor.getPlugin('localized-row') === window.editor.element.querySelector('[role="listbox"]')!.lastElementChild,
    calls: window.editor.getPlugin<{ calls: number }>('localized-provider')!.calls,
    activeIndex: window.mentionCommands(window.editor).getState().activeIndex,
  }))).toEqual({ ...before, same: true, calls: 1, activeIndex: 1 });
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

for (const mode of ['loading', 'empty', 'error'] as const) test(`suggestion ${mode} status switches language without exposing provider diagnostics`, async ({ page }) => {
  await initializeSuggestions(page, mode);
  await expect.poll(() => page.evaluate(() => window.mentionCommands(window.editor).getState().status)).toBe(mode === 'empty' ? 'ready' : mode);
  if (mode === 'empty') expect(await page.evaluate(() => window.mentionCommands(window.editor).getState().items)).toEqual([]);
  const messages = {
    loading: ['Загрузка подсказок…', 'Loading suggestions…'],
    empty: ['Нет подсказок', 'No suggestions'],
    error: ['Не удалось загрузить подсказки', 'Unable to load suggestions'],
  };
  await expect(page.locator('.mw-suggestions-status')).toHaveText(messages[mode][0]);
  await page.evaluate(() => window.editor.setLocale('en'));
  await expect(page.locator('.mw-suggestions-status')).toHaveText(messages[mode][1]);
  await expect(page.locator('.mw-suggestions')).not.toContainText('Application-private');
  expect(await page.evaluate(() => window.editor.getPlugin<{ calls: number }>('localized-provider')!.calls)).toBe(1);
});

test('explicit menu locale and label fields retain precedence while disposed menus stop updating', async ({ page }) => {
  await initializeSuggestions(page, 'empty', true);
  await expect.poll(() => page.evaluate(() => window.mentionCommands(window.editor).getState().status)).toBe('ready');
  expect(await page.evaluate(() => window.mentionCommands(window.editor).getState().items)).toEqual([]);
  const box = page.getByRole('listbox', { name: 'People <strong>', exact: true });
  await expect(page.locator('.mw-suggestions-status')).toHaveText('Nobody!');
  await page.evaluate(() => window.editor.setLocale('ru', { 'suggestions.label': 'Ignored by explicit label', 'suggestions.empty': 'Ignored' }));
  await expect(box).toHaveAttribute('aria-label', 'People <strong>');
  await expect(box.locator('strong')).toHaveCount(0);
  await expect(page.locator('.mw-suggestions-status')).toHaveText('Nobody!');
  expect(await page.evaluate(() => {
    const box = window.editor.element.querySelector('[role="listbox"]')!;
    window.editor.getPlugin<() => void>('localized-dispose')!();
    window.editor.setLocale('en', { 'suggestions.label': 'Must not reach detached view' });
    return { connected: box.isConnected, label: box.getAttribute('aria-label') };
  })).toEqual({ connected: false, label: 'People <strong>' });
});

test('plugin interface languages are isolated between editor instances', async ({ page }) => {
  await initializeTables(page);
  expect(await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.append(host);
    const second = window.createEditor(host, { locale: 'en', plugins: [window.createTables()] });
    window.editor.setLocale('ru', { 'tables.rowAbove': 'Only first' });
    const labels = [window.editor, second].map((editor) => editor.element.querySelector('[role="menuitem"]')!.textContent);
    second.destroy();
    window.editor.setLocale('en');
    return labels;
  })).toEqual(['Only first', 'Insert row above']);
});
