import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { LinkFormController } from '@morfira-dev/wysiwyg/ui/links';

const initialize = async (page: Page, html: string, index = 0, length = 0) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ html, index, length }) => {
    window.dispose();
    window.changes = [];
    const editorHost = document.createElement('div');
    const formHost = document.createElement('div');
    document.body.append(editorHost, formHost);
    const errors: unknown[] = [];
    window.editor = window.createEditor(editorHost, { value: html, locale: 'en', onChange: (change) => window.changes.push(change) });
    window.editor.setSelection(index, length);
    const modulePath = '/packages/plugins/dist/ui/links.js';
    const { createLinkForm } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/ui/links');
    const form = createLinkForm(formHost, window.editor, { onError: (error) => errors.push(error) });
    window.editor.providePlugin('test-link-form', form);
    window.editor.providePlugin('test-link-errors', errors);
  }, { html, index, length });
};

const currentHTML = (page: Page) => page.evaluate(() => window.editor.getHTML());

test('link form applies metadata to rich selected text after inputs take focus and preserves history', async ({ page }) => {
  const original = '<p>A<strong>word</strong>Z</p>';
  await initialize(page, original, 1, 4);
  await page.getByLabel('Link URL', { exact: true }).fill('https://example.com/article');
  await page.getByLabel('Link title', { exact: true }).fill('Article title');
  await page.getByLabel('Open in new tab', { exact: true }).check();
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  const anchor = page.locator('.mw-content a');
  await expect(anchor).toHaveText('word');
  await expect(anchor).toHaveAttribute('href', 'https://example.com/article');
  await expect(anchor).toHaveAttribute('title', 'Article title');
  await expect(anchor).toHaveAttribute('target', '_blank');
  await expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.mw-content strong')).toHaveText('word');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 1, length: 4 });
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await currentHTML(page)).toBe(original);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await expect(anchor).toHaveText('word');
});

test('linked-caret metadata is inspected and updated without replacing its label, then unlink is undoable', async ({ page }) => {
  const original = '<p><a href="https://example.com/old" title="Old"><em>Label</em></a> tail</p>';
  await initialize(page, original, 2);
  await expect(page.getByLabel('Link URL', { exact: true })).toHaveValue('https://example.com/old');
  await expect(page.getByLabel('Link title', { exact: true })).toHaveValue('Old');
  await page.getByLabel('Link URL', { exact: true }).fill('https://example.com/new');
  await page.getByLabel('Link title', { exact: true }).fill('New');
  await page.getByLabel('New link text', { exact: true }).fill('Must not replace Label');
  await page.getByRole('button', { name: 'Update link', exact: true }).click();
  await expect(page.locator('.mw-content a')).toHaveText('Label');
  await expect(page.locator('.mw-content a')).toHaveAttribute('href', 'https://example.com/new');
  await expect(page.locator('.mw-content a')).toHaveAttribute('title', 'New');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  await page.getByRole('button', { name: 'Unlink', exact: true }).click();
  expect(await currentHTML(page)).toBe('<p><em>Label</em> tail</p>');
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.mw-content a')).toHaveAttribute('href', 'https://example.com/new');
  await page.evaluate(() => window.editor.undo());
  expect(await currentHTML(page)).toBe(original);
});

test('new escaped label inserts in the chosen empty block and undo restores that block selection', async ({ page }) => {
  const original = '<p><br></p><p><br></p>';
  await initialize(page, original);
  await page.evaluate(() => {
    const paragraph = window.editor.surface.querySelectorAll('p')[1];
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(true);
    window.editor.surface.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.editor.getPlugin<LinkFormController>('test-link-form')!.refresh();
    window.editor.getPlugin<LinkFormController>('test-link-form')!.setValues({ href: 'https://example.com', text: '<b>Label</b>' });
  });
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(page.locator('.mw-content p').first().locator('br')).toHaveCount(1);
  await expect(page.locator('.mw-content p').nth(1).locator('a')).toHaveText('<b>Label</b>');
  await expect(page.locator('.mw-content b')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await currentHTML(page)).toBe(original);
  expect(await page.evaluate(() => {
    const range = document.getSelection()!.getRangeAt(0);
    return range.startContainer === window.editor.surface.querySelectorAll('p')[1];
  })).toBe(true);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('X');
  await expect(page.locator('.mw-content p').nth(1)).toHaveText('<b>Label</b>X');
  await expect(page.locator('.mw-content a')).toHaveText('<b>Label</b>');
});

test('backwards Unicode selection and selection crossing existing links can be edited and unlinked', async ({ page }) => {
  await initialize(page, '<p>A😀BC</p>', 1, 2);
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('p')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 3, text, 1);
    window.editor.getPlugin<LinkFormController>('test-link-form')!.refresh();
  });
  await page.getByLabel('Link URL', { exact: true }).fill('https://example.com');
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(page.locator('.mw-content a')).toHaveText('😀');
  await page.evaluate(() => window.editor.undo());
  expect(await currentHTML(page)).toBe('<p>A😀BC</p>');
  expect(await page.evaluate(() => document.getSelection()!.toString())).toBe('😀');
  await page.evaluate(() => {
    window.editor.setHTML('<p>A<a href="https://example.com">BC</a>D</p>');
    window.editor.setSelection(0, 4);
  });
  await expect(page.getByRole('button', { name: 'Unlink', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Unlink', exact: true }).click();
  expect(await currentHTML(page)).toBe('<p>ABCD</p>');
});

test('invalid links retain drafts and content while locale and translation overrides update safely', async ({ page }) => {
  await initialize(page, '<p>Label</p>', 0, 5);
  await page.getByLabel('Link URL', { exact: true }).fill('javascript:alert(1)');
  await page.getByLabel('Link title', { exact: true }).fill('Retain this title');
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  expect(await currentHTML(page)).toBe('<p>Label</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await expect(page.locator('.mw-form-status')).toHaveText('Unable to save this link. Check its address and fields.');
  expect(await page.evaluate(() => window.editor.getPlugin<unknown[]>('test-link-errors')!.length)).toBe(1);
  await page.evaluate(() => window.editor.setLocale('ru', { 'ui.links.create': '<img src=x onerror=alert(1)>' }));
  await expect(page.getByLabel('Адрес ссылки', { exact: true })).toHaveValue('javascript:alert(1)');
  await expect(page.getByLabel('Заголовок ссылки', { exact: true })).toHaveValue('Retain this title');
  await expect(page.getByRole('button', { name: '<img src=x onerror=alert(1)>', exact: true })).toBeVisible();
  await expect(page.locator('.mw-link-form img')).toHaveCount(0);
  const unchanged = await page.evaluate(() => {
    const form = window.editor.getPlugin<LinkFormController>('test-link-form')!;
    const before = form.getValues();
    let failed = false;
    try { form.setValues({ href: 'https://safe.example', newTab: 'bad' as unknown as boolean }); }
    catch { failed = true; }
    return { failed, before, after: form.getValues() };
  });
  expect(unchanged.failed).toBe(true);
  expect(unchanged.after).toEqual(unchanged.before);
  await page.getByLabel('Адрес ссылки', { exact: true }).fill('https://example.com');
  await page.getByRole('button', { name: '<img src=x onerror=alert(1)>', exact: true }).click();
  await expect(page.locator('.mw-content a')).toHaveText('Label');
});

test('external replacement rejects the remembered target until a fresh editor selection', async ({ page }) => {
  await initialize(page, '<p>Original</p>', 0, 8);
  await page.getByLabel('Link URL', { exact: true }).fill('https://example.com');
  await page.evaluate(() => window.editor.setHTML('<p>External</p>'));
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  expect(await currentHTML(page)).toBe('<p>External</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await expect(page.locator('.mw-form-status')).toHaveText('Select text or place the caret in the editor first.');
  await page.evaluate(() => window.editor.setSelection(0, 8));
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(page.locator('.mw-content a')).toHaveText('External');
});

test('read-only guards native and synthetic submits while preserving form drafts', async ({ page }) => {
  await initialize(page, '<p>Label</p>', 0, 5);
  await page.getByLabel('Link URL', { exact: true }).fill('https://example.com');
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(page.getByRole('button', { name: 'Create link', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Create link', exact: true }).evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  expect(await currentHTML(page)).toBe('<p>Label</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(page.getByLabel('Адрес ссылки', { exact: true })).toHaveValue('https://example.com');
  await page.evaluate(() => window.editor.setReadOnly(false));
  await page.getByRole('button', { name: 'Создать ссылку', exact: true }).click();
  await expect(page.locator('.mw-content a')).toHaveText('Label');
});

test('independent controllers and editor teardown dispose all retained controls', async ({ page }) => {
  await initialize(page, '<p>First</p>', 0, 5);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/plugins/dist/ui/links.js';
    const { createLinkForm } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/ui/links');
    const host = document.createElement('div');
    const controls = document.createElement('div');
    document.body.append(host, controls);
    const second = window.createEditor(host, { value: '<p>Second</p>', locale: 'ru' });
    second.setSelection(0, 6);
    const secondForm = createLinkForm(controls, second, { label: 'Own form label', initialValues: { href: 'https://second.example' } });
    const first = window.editor.getPlugin<LinkFormController>('test-link-form')!;
    first.setValues({ href: 'https://first.example' });
    const button = first.element.querySelector('button')!;
    first.destroy();
    first.destroy();
    button.click();
    let inactive = false;
    try { first.getValues(); }
    catch { inactive = true; }
    const copy = secondForm.getValues();
    copy.href = 'https://mutated.example';
    const beforeDestroy = { first: window.editor.getHTML(), second: second.getHTML(), secondDraft: secondForm.getValues().href, label: secondForm.element.getAttribute('aria-label'), inactive };
    second.destroy();
    return { ...beforeDestroy, connected: secondForm.element.isConnected };
  });
  expect(result).toEqual({ first: '<p>First</p>', second: '<p>Second</p>', secondDraft: 'https://second.example', label: 'Own form label', inactive: true, connected: false });
});

test('link controls embed inside an application form and Enter never submits the outer form', async ({ page }) => {
  await initialize(page, '<p>Label</p>', 0, 5);
  await page.evaluate(() => {
    const section = window.editor.getPlugin<LinkFormController>('test-link-form')!.element;
    const applicationForm = document.createElement('form');
    applicationForm.id = 'application-form';
    applicationForm.dataset.submits = '0';
    applicationForm.addEventListener('submit', (event) => {
      event.preventDefault();
      applicationForm.dataset.submits = String(Number(applicationForm.dataset.submits) + 1);
    });
    section.before(applicationForm);
    applicationForm.append(section);
  });
  await page.getByLabel('Link URL', { exact: true }).fill('/relative-article');
  await page.getByLabel('Link URL', { exact: true }).press('Enter');
  await expect(page.locator('.mw-content a')).toHaveAttribute('href', '/relative-article');
  await expect(page.locator('#application-form')).toHaveAttribute('data-submits', '0');
  await expect(page.locator('#application-form form')).toHaveCount(0);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
});

test('link form public module imports on the server without browser globals', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', "import { createLinkForm } from '@morfira-dev/wysiwyg/ui/links'; process.stdout.write(JSON.stringify({ type: typeof createLinkForm, document: typeof document }));"], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(output)).toEqual({ type: 'function', document: 'undefined' });
});
