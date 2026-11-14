import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
};

test('localization helper is SSR safe and resolves exact, base, English and custom copy', async () => {
  const { localize } = await import('@morfira-dev/wysiwyg-core');
  const dictionaries = {
    en: { 'example.message': 'English' },
    ru: { 'example.message': 'Русский' },
    'en-GB': { 'example.message': 'British' },
  };
  expect(localize({ locale: 'en-GB', translations: {} }, 'example.message', dictionaries)).toBe('British');
  expect(localize({ locale: 'ru-RU', translations: {} }, 'example.message', dictionaries)).toBe('Русский');
  expect(localize({ locale: 'de-DE', translations: {} }, 'example.message', dictionaries)).toBe('English');
  expect(localize({ locale: 'de-DE', translations: { 'example.message': 'Deutsch' } }, 'example.message', dictionaries)).toBe('Deutsch');
  expect(() => localize({ locale: 'en', translations: {} }, 'missing', dictionaries)).toThrow('Missing English fallback');
});

test('initial locale validates atomically and independent editors use canonical tags and language fallbacks', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const englishHost = document.createElement('div');
    const customHost = document.createElement('div');
    const invalidHost = document.createElement('div');
    document.body.append(englishHost, customHost, invalidHost);
    const english = window.createEditor(englishHost, { locale: 'EN-us' });
    const custom = window.createEditor(customHost, { locale: 'de-DE', translations: { 'editor.label': 'Mein Editor' } });
    let rejected = false;
    try { window.createEditor(invalidHost, { locale: 'not a language tag' }); }
    catch { rejected = true; }
    const result = {
      english: { state: english.getLocale(), label: english.surface.getAttribute('aria-label'), placeholder: english.surface.dataset.placeholder },
      custom: { label: custom.surface.getAttribute('aria-label'), placeholder: custom.surface.dataset.placeholder },
      original: window.editor.getLocale(), rejected, invalidChildren: invalidHost.childNodes.length,
    };
    english.destroy();
    custom.destroy();
    englishHost.remove();
    customHost.remove();
    invalidHost.remove();
    return result;
  });
  expect(result).toEqual({
    english: { state: { locale: 'en-US', translations: {} }, label: 'Text editor', placeholder: 'Start writing…' },
    custom: { label: 'Mein Editor', placeholder: 'Start writing…' },
    original: { locale: 'ru', translations: {} }, rejected: true, invalidChildren: 0,
  });
});

test('live language updates default toolbar without replacing document nodes, selection or history', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => {
    window.editor.setHTML('<p>Hello</p>');
    window.editor.setSelection(1, 3);
    window.editor.format('bold', true);
    window.editor.providePlugin('locale-surface', window.editor.surface);
    window.editor.providePlugin('locale-paragraph', window.editor.surface.querySelector('p'));
    return { html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length };
  });
  await page.evaluate(() => window.editor.setLocale('en'));
  await expect(page.getByRole('toolbar')).toHaveAttribute('aria-label', 'Formatting');
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('title', 'Bold');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  const after = await page.evaluate(() => ({
    html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length,
    sameSurface: window.editor.getPlugin('locale-surface') === window.editor.surface,
    sameParagraph: window.editor.getPlugin('locale-paragraph') === window.editor.surface.querySelector('p'),
  }));
  expect(after).toEqual({ ...before, sameSurface: true, sameParagraph: true });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Hello</p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 1, length: 3 });
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(page.getByRole('button', { name: 'Полужирный', exact: true })).toBeVisible();
});

test('override snapshots are isolated, escaped, idempotent and rejected values leave locale unchanged', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const translations = { 'editor.label': '<img src=x onerror=alert(1)>', 'toolbar.bold': '<b>Custom bold</b>' };
    const delivered: string[] = [];
    const offFirst = window.editor.events.on('localechange', (state) => {
      delivered.push(state.translations['toolbar.bold']);
      (state.translations as Record<string, string>)['toolbar.bold'] = 'mutated listener snapshot';
    });
    const offSecond = window.editor.events.on('localechange', (state) => delivered.push(state.translations['toolbar.bold']));
    window.editor.setLocale('en', translations);
    translations['toolbar.bold'] = 'mutated caller record';
    const snapshot = window.editor.getLocale();
    (snapshot.translations as Record<string, string>)['toolbar.bold'] = 'mutated returned snapshot';
    window.editor.setLocale('en', { 'toolbar.bold': '<b>Custom bold</b>', 'editor.label': '<img src=x onerror=alert(1)>' });
    const before = window.editor.getLocale();
    let rejected = 0;
    try { window.editor.setLocale('bad locale'); } catch { rejected++; }
    try { window.editor.setLocale('fr', { 'toolbar.bold': 42 } as unknown as Record<string, string>); } catch { rejected++; }
    offFirst();
    offSecond();
    return { before, after: window.editor.getLocale(), delivered, rejected, images: window.editor.element.querySelectorAll('img').length };
  });
  expect(result.after).toEqual(result.before);
  expect(result.after.translations['toolbar.bold']).toBe('<b>Custom bold</b>');
  expect(result.delivered).toEqual(['<b>Custom bold</b>', '<b>Custom bold</b>']);
  expect(result.rejected).toBe(2);
  expect(result.images).toBe(0);
  await expect(page.getByRole('textbox')).toHaveAttribute('aria-label', '<img src=x onerror=alert(1)>');
  await expect(page.getByRole('button', { name: '<b>Custom bold</b>', exact: true })).toBeVisible();
});

test('locale replacement is prohibited inside document transactions and cannot escape swallowed rejection', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    window.editor.setHTML('<p>Before</p>');
    let failed = false;
    try {
      window.editor.transact((surface) => {
        surface.querySelector('p')!.textContent = 'During';
        try { window.editor.setLocale('en'); } catch { /* Outer transaction must still reject. */ }
      });
    }
    catch { failed = true; }
    return { failed, html: window.editor.getHTML(), locale: window.editor.getLocale().locale, undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ failed: true, html: '<p>Before</p>', locale: 'ru', undo: false });
});

test('language switching preserves active composition and remains available while read-only', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<p>Start</p>');
    editor.setSelection(5);
    window.changes.length = 0;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.surface.querySelector('p')!.textContent = 'Startあ';
    editor.setSelection(6);
    editor.surface.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true, bubbles: true }));
    editor.setLocale('en');
    const interim = { html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length, undo: editor.canUndo() };
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { data: 'あ', bubbles: true }));
    const committed = { html: editor.getHTML(), changes: window.changes.length };
    editor.undo();
    editor.setReadOnly(true);
    const beforeReadOnlyLocale = window.changes.length;
    editor.setLocale('ru');
    return { interim, committed, undone: editor.getHTML(), changesAfterReadOnlyLocale: window.changes.length - beforeReadOnlyLocale, locale: editor.getLocale().locale };
  });
  expect(result).toEqual({
    interim: { html: '<p>Startあ</p>', selection: { index: 6, length: 0 }, changes: 0, undo: false },
    committed: { html: '<p>Startあ</p>', changes: 1 }, undone: '<p>Start</p>', changesAfterReadOnlyLocale: 0, locale: 'ru',
  });
});

test('explicit editor and custom toolbar labels retain precedence and disposal removes locale subscription', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const path = '/packages/core/dist/index.js';
    const { createToolbar } = await import(path);
    const host = document.createElement('div');
    const controls = document.createElement('div');
    document.body.append(host, controls);
    const editor = window.createEditor(host, { label: 'Application editor', placeholder: 'Application placeholder', value: '<p>Text</p>' });
    const disposeToolbar = createToolbar(controls, editor, [{ label: 'Application bold', text: 'B', format: 'bold' }], { label: 'Application controls' });
    editor.setLocale('en', { 'editor.label': 'Ignored editor override', 'editor.placeholder': 'Ignored placeholder override', 'toolbar.bold': 'Ignored action override', 'toolbar.label': 'Ignored toolbar override' });
    const button = controls.querySelector('button')!;
    const result = { label: editor.surface.getAttribute('aria-label'), placeholder: editor.surface.dataset.placeholder, toolbar: controls.firstElementChild!.getAttribute('aria-label'), button: button.getAttribute('aria-label') };
    disposeToolbar();
    editor.setLocale('ru');
    button.click();
    const html = editor.getHTML();
    editor.destroy();
    host.remove();
    controls.remove();
    return { ...result, html, detached: !button.isConnected };
  });
  expect(result).toEqual({ label: 'Application editor', placeholder: 'Application placeholder', toolbar: 'Application controls', button: 'Application bold', html: '<p>Text</p>', detached: true });
});

test('throwing locale observers do not roll back state or stop remaining observers and destroyed APIs reject', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    let notified = 0;
    const off = window.editor.events.on('localechange', () => { throw new Error('Observer'); });
    window.editor.events.on('localechange', () => notified++);
    let aggregate = false;
    try { window.editor.setLocale('en'); } catch (error) { aggregate = error instanceof AggregateError; }
    const locale = window.editor.getLocale().locale;
    off();
    window.dispose();
    let rejected = 0;
    try { window.editor.getLocale(); } catch { rejected++; }
    try { window.editor.setLocale('ru'); } catch { rejected++; }
    return { aggregate, locale, notified, rejected };
  });
  expect(result).toEqual({ aggregate: true, locale: 'en', notified: 1, rejected: 2 });
});
