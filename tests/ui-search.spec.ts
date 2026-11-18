import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SearchFormController } from '@morfira-dev/wysiwyg/ui/search';

declare global {
  interface Window {
    searchForm: SearchFormController;
    searchFormErrors: unknown[];
    detachedSearchForm: HTMLElement;
  }
}

const initialize = async (page: Page, value = '<p>One <strong>one</strong> ONE</p>') => {
  await page.goto('/');
  await expect(page.locator('.mw-content')).toBeVisible();
  await page.evaluate(async (html) => {
    window.dispose();
    const editorHost = document.createElement('div');
    editorHost.className = 'search-form-editor';
    const formHost = document.createElement('div');
    formHost.className = 'search-form-host';
    document.body.replaceChildren(editorHost, formHost);
    window.changes = [];
    window.editor = window.createEditor(editorHost, {
      value: html, locale: 'en', plugins: [window.createSearch()],
      onChange: (change) => window.changes.push(change),
    });
    window.searchFormErrors = [];
    const modulePath = '/packages/plugins/dist/ui/search.js';
    const { createSearchForm } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/ui/search');
    window.searchForm = createSearchForm(formHost, window.editor, { onError: (error) => window.searchFormErrors.push(error) });
    window.editor.setSelection(0);
  }, value);
};

const find = async (page: Page, value: string) => {
  await page.getByLabel('Find text', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Find', exact: true }).click();
};

test('search form selects rich-text results and replacement is one undoable operation', async ({ page }) => {
  await initialize(page);
  const original = await page.evaluate(() => window.editor.getHTML());
  await find(page, 'one');
  await expect(page.locator('.mw-form-status')).toHaveText('Match 1 of 3');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('One');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('one');
  await page.getByLabel('Replace with', { exact: true }).fill('X');
  await page.getByRole('button', { name: 'Replace all', exact: true }).click();
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>X <strong>X</strong> X</p>');
  await expect(page.locator('.mw-form-status')).toHaveText('Replaced: 3');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await expect(page.locator('.mw-form-status')).toHaveText('Match 1 of 3');
});

test('query Shift+Enter applies a draft, wraps backwards and navigates read-only without history', async ({ page }) => {
  await initialize(page);
  const original = await page.evaluate(() => window.editor.getHTML());
  const query = page.getByLabel('Find text', { exact: true });
  await expect(query).toHaveAttribute('aria-keyshortcuts', 'Enter Shift+Enter');
  await query.fill('one');
  await query.press('Shift+Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('Match 3 of 3');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('ONE');
  await query.press('Shift+Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('Match 2 of 3');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('one');
  await page.evaluate(() => window.editor.setReadOnly(true));
  await query.press('Shift+Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('Match 1 of 3');
  await query.press('Shift+Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('Match 3 of 3');
  await query.press('Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('Match 1 of 3');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length })))
    .toEqual({ html: original, undo: false, changes: 0 });
});

test('backward search guards composition and modifiers, and invalid drafts cannot navigate stale matches', async ({ page }) => {
  await initialize(page);
  const query = page.getByLabel('Find text', { exact: true });
  await query.fill('one');
  await query.press('Shift+Enter');
  await query.evaluate((input) => {
    for (const extra of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }])
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true, ...extra }));
  });
  await expect(page.locator('.mw-form-status')).toHaveText('Match 3 of 3');
  await page.evaluate(() => window.searchForm.setValues({ query: 'x'.repeat(1001) }));
  await query.press('Shift+Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('Unable to search. Check the query and try again.');
  expect(await page.evaluate(() => window.searchCommands(window.editor).getState().current)).toBe(2);
  await query.fill('missing');
  await query.press('Shift+Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('No matches found.');
  await query.fill('');
  await query.press('Shift+Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('Enter a query and press Find.');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('case and whole-word controls update the indexed query only when submitted', async ({ page }) => {
  await initialize(page, '<p>cat scatter CAT cat2 cat</p>');
  await find(page, 'cat');
  await expect(page.locator('.mw-form-status')).toHaveText('Match 1 of 5');
  await page.getByLabel('Whole word', { exact: true }).check();
  await expect(page.getByRole('button', { name: 'Next match', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.locator('.mw-form-status')).toHaveText('Match 1 of 3');
  await page.getByLabel('Match case', { exact: true }).check();
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.locator('.mw-form-status')).toHaveText('Match 1 of 2');
  await page.getByRole('button', { name: 'Previous match', exact: true }).click();
  await expect(page.locator('.mw-form-status')).toHaveText('Match 2 of 2');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('cat');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('changing a query draft disables old-result actions until Find and replacement ignores unrelated native selection', async ({ page }) => {
  await initialize(page, '<p>one two one two</p>');
  await find(page, 'one');
  await page.getByLabel('Replace with', { exact: true }).fill('X');
  await page.getByLabel('Find text', { exact: true }).fill('two');
  await expect(page.getByRole('button', { name: 'Replace all', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next match', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Replace all', exact: true }).dispatchEvent('click');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>one two one two</p>');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.evaluate(() => window.editor.setSelection(0, 3));
  await page.getByRole('button', { name: 'Replace match', exact: true }).click();
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>one X one two</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>one two one two</p>');
});

test('read-only keeps search navigation and clear available and follows external replacement', async ({ page }) => {
  await initialize(page);
  await find(page, 'one');
  await page.getByLabel('Replace with', { exact: true }).fill('draft');
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(page.getByRole('button', { name: 'Replace all', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Replace with', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('one');
  await page.evaluate(() => window.editor.setHTML('<p>one</p>'));
  await expect(page.locator('.mw-form-status')).toHaveText('Match 1 of 1');
  await page.getByRole('button', { name: 'Replace all', exact: true }).dispatchEvent('click');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>one</p>');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByLabel('Find text', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Replace with', { exact: true })).toHaveValue('draft');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('locale and custom overrides preserve field drafts and render only text', async ({ page }) => {
  await initialize(page);
  await page.getByLabel('Find text', { exact: true }).fill('one');
  await page.getByLabel('Replace with', { exact: true }).fill('draft');
  await page.evaluate(() => window.editor.setLocale('ru', { 'ui.search.find': '<b>Find now</b>' }));
  await expect(page.getByRole('form')).toHaveAttribute('aria-label', 'Поиск и замена');
  await expect(page.getByRole('button', { name: '<b>Find now</b>', exact: true })).toBeVisible();
  await expect(page.locator('.mw-search-form b')).toHaveCount(0);
  await expect(page.getByLabel('Найти текст', { exact: true })).toHaveValue('one');
  await expect(page.getByLabel('Найти текст', { exact: true })).toHaveAttribute('title', 'Enter: найти. Shift+Enter: предыдущее совпадение.');
  await expect(page.getByLabel('Заменить на', { exact: true })).toHaveValue('draft');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('invalid queries and replacements retain drafts and recover without changing history', async ({ page }) => {
  await initialize(page);
  const original = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => {
    window.searchForm.setValues({ query: 'a'.repeat(1001) });
    window.searchForm.element.querySelector<HTMLButtonElement>('button')!.click();
  });
  await expect(page.locator('.mw-form-status')).toHaveText('Unable to search. Check the query and try again.');
  expect(await page.evaluate(() => window.searchForm.getValues().query.length)).toBe(1001);
  expect(await page.evaluate(() => window.searchFormErrors.length)).toBe(1);
  await find(page, 'one');
  await page.evaluate(() => window.searchForm.setValues({ replacement: 'x'.repeat(20001) }));
  await page.getByRole('button', { name: 'Replace all', exact: true }).click();
  await expect(page.locator('.mw-form-status')).toHaveText('Unable to replace. Check the replacement and try again.');
  expect(await page.evaluate(() => window.searchForm.getValues().replacement.length)).toBe(20001);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.getByLabel('Replace with', { exact: true }).fill('X');
  await page.getByRole('button', { name: 'Replace all', exact: true }).click();
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>X <strong>X</strong> X</p>');
});

test('external query updates preserve active drafts and independent forms dispose without clearing plugin state', async ({ page }) => {
  await initialize(page);
  await find(page, 'one');
  await page.getByLabel('Find text', { exact: true }).fill('unfinished');
  await page.evaluate(() => window.searchCommands(window.editor).setQuery('ONE', { caseSensitive: true }));
  await expect(page.getByLabel('Find text', { exact: true })).toHaveValue('unfinished');
  await page.evaluate(async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const other = window.createEditor(host, { locale: 'ru', value: '<p>Other</p>', plugins: [window.createSearch()] });
    const formHost = document.createElement('div');
    document.body.append(formHost);
    const modulePath = '/packages/plugins/dist/ui/search.js';
    const { createSearchForm } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/ui/search');
    const form = createSearchForm(formHost, other, { label: 'Second search', initialValues: { query: 'Other' } });
    other.providePlugin('search-form-test', form);
    window.editor.providePlugin('other-search-editor', other);
    window.detachedSearchForm = window.searchForm.element;
    window.searchForm.destroy();
    window.searchForm.destroy();
  });
  expect(await page.evaluate(() => window.searchCommands(window.editor).getState().query)).toBe('ONE');
  await page.evaluate(() => window.detachedSearchForm.querySelector<HTMLButtonElement>('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(await page.evaluate(() => window.searchCommands(window.editor).getState().query)).toBe('ONE');
  await expect(page.getByRole('form', { name: 'Second search', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const other = window.editor.getPlugin<import('@morfira-dev/wysiwyg').Editor>('other-search-editor')!;
    other.destroy();
  });
  await expect(page.getByRole('form')).toHaveCount(0);
  expect(await page.evaluate(() => {
    try { window.searchForm.refresh(); return false; }
    catch { return true; }
  })).toBe(true);
});

test('mounting without a plugin fails before DOM writes and query Enter does not submit the application form', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const modulePath = '/packages/plugins/dist/ui/search.js';
    const { createSearchForm } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/ui/search');
    const host = document.createElement('div');
    document.body.append(host);
    const editor = window.createEditor(host);
    const formHost = document.createElement('div');
    formHost.textContent = 'Unrelated child';
    document.body.append(formHost);
    let rejected = false;
    try { createSearchForm(formHost, editor); } catch { rejected = true; }
    editor.destroy();
    const applicationForm = document.createElement('form');
    let submissions = 0;
    applicationForm.addEventListener('submit', () => { submissions++; });
    document.body.append(applicationForm);
    applicationForm.append(window.searchForm.element);
    window.editor.providePlugin('outer-submit-count', () => submissions);
    return { rejected, original: formHost.textContent, nestedForms: applicationForm.querySelectorAll('form').length };
  })).toEqual({ rejected: true, original: 'Unrelated child', nestedForms: 0 });
  await page.getByLabel('Find text', { exact: true }).fill('one');
  await page.getByLabel('Find text', { exact: true }).press('Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('Match 1 of 3');
  await page.getByLabel('Find text', { exact: true }).press('Shift+Enter');
  await expect(page.locator('.mw-form-status')).toHaveText('Match 3 of 3');
  await page.getByLabel('Find text', { exact: true }).press('Enter');
  await page.getByLabel('Replace with', { exact: true }).fill('X');
  await page.getByLabel('Replace with', { exact: true }).press('Enter');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>X <strong>one</strong> ONE</p>');
  expect(await page.evaluate(() => window.editor.getPlugin<() => number>('outer-submit-count')!())).toBe(0);
});

test('draft snapshots are independent and invalid partial updates reject atomically', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.searchForm.setValues({ query: 'one', replacement: 'draft', wholeWord: true }));
  expect(await page.evaluate(() => {
    const before = window.searchForm.getValues();
    const copy = window.searchForm.getValues();
    copy.query = 'not shared';
    let rejected = false;
    try { window.searchForm.setValues({ query: 'should not apply', wholeWord: 'yes' as unknown as boolean }); }
    catch { rejected = true; }
    window.searchForm.setValues({ query: undefined });
    return { before, after: window.searchForm.getValues(), rejected };
  })).toEqual({
    before: { query: 'one', replacement: 'draft', caseSensitive: false, wholeWord: true },
    after: { query: 'one', replacement: 'draft', caseSensitive: false, wholeWord: true }, rejected: true,
  });
  await expect(page.getByLabel('Find text', { exact: true })).toHaveValue('one');
  expect(await page.evaluate(() => window.searchCommands(window.editor).getState().query)).toBe('');
});

test('search UI public entry is import-safe without browser globals', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { createSearchForm, searchFormMessages } from '@morfira-dev/wysiwyg/ui/search';
    process.stdout.write(JSON.stringify({ factory: typeof createSearchForm, english: searchFormMessages.en['ui.search.find'], document: typeof document }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(output)).toEqual({ factory: 'function', english: 'Find', document: 'undefined' });
});
