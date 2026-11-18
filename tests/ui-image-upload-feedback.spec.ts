import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { initializeUploadFeedback } from './image-upload-feedback.fixture.js';
import './ui-image-upload-feedback.types.js';

const initialize = async (page: Page) => {
  await initializeUploadFeedback(page);
  await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    const host = document.createElement('div');
    host.className = 'upload-feedback-form';
    document.body.append(host);
    window.feedbackFormErrors = [];
    window.feedbackForm = createImageForm(host, window.editor, { onError: (error) => window.feedbackFormErrors.push(String(error)) });
    window.dispose = () => { window.feedbackForm.destroy(); window.feedbackOtherForm?.destroy(); window.editor.destroy(); host.remove(); };
  });
};
const form = (page: Page) => page.locator('.upload-feedback-form');
const upload = (page: Page) => form(page).getByLabel('Image file', { exact: true }).setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: Buffer.from('png') });
const retry = (page: Page) => form(page).getByRole('button', { name: 'Retry upload', exact: true });

test('form shows unknown and known progress, hides raw failures and explicitly retries at the original caret', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  await upload(page);
  await expect.poll(() => page.evaluate(() => window.feedbackAttempts.length)).toBe(1);
  const progress = form(page).getByRole('progressbar', { name: 'Image upload progress', exact: true });
  await expect(progress).toBeVisible();
  expect(await progress.getAttribute('value')).toBeNull();
  await page.evaluate(() => window.feedbackAttempts[0].context.reportProgress({ loaded: 1, total: 4 }));
  expect(await progress.evaluate((node) => ({ value: (node as HTMLProgressElement).value, max: (node as HTMLProgressElement).max }))).toEqual({ value: 25, max: 100 });
  await expect(form(page).getByRole('button', { name: 'Insert image', exact: true })).toBeDisabled();
  await page.evaluate(() => window.feedbackAttempts[0].fail(new Error('<img src=x onerror=alert(1)> secret/path')));
  await expect(retry(page)).toBeVisible();
  await expect(progress).not.toBeVisible();
  await expect(form(page).locator('.mw-form-status')).toContainText('Unable to upload');
  await expect(form(page)).not.toContainText('secret/path');
  await expect(form(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.setSelection(4));
  await retry(page).click();
  await expect.poll(() => page.evaluate(() => window.feedbackAttempts.length)).toBe(2);
  expect(await page.evaluate(() => window.feedbackAttempts[0].file === window.feedbackAttempts[1].file)).toBe(true);
  await page.evaluate(() => {
    window.feedbackAttempts[0].context.reportProgress({ loaded: 4, total: 4 });
    window.feedbackAttempts[1].context.reportProgress({ loaded: 2, total: 4 });
  });
  expect(await progress.evaluate((node) => (node as HTMLProgressElement).value)).toBe(50);
  await page.evaluate(() => window.feedbackAttempts[1].finish({ src: '/logo.svg', alt: 'Retried' }));
  await expect(page.locator('.upload-feedback-editor img')).toHaveAttribute('alt', 'Retried');
  await expect(page.locator('.upload-feedback-editor p strong')).toHaveText(['ab', 'cd']);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await expect(retry(page)).not.toBeVisible();
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual({ html: before, selection: { index: 2, length: 0 } });
});

test('locale changes preserve progress and cancelling pending work cannot resurrect retry', async ({ page }) => {
  await initialize(page);
  await upload(page);
  await expect.poll(() => page.evaluate(() => window.feedbackAttempts.length)).toBe(1);
  await page.evaluate(() => {
    window.feedbackAttempts[0].context.reportProgress({ loaded: 7, total: 10 });
    window.editor.setLocale('ru');
  });
  const progress = form(page).getByRole('progressbar', { name: 'Прогресс загрузки изображения', exact: true });
  await expect(progress).toBeVisible();
  expect(await progress.evaluate((node) => (node as HTMLProgressElement).value)).toBe(70);
  await form(page).getByRole('button', { name: 'Отменить загрузку', exact: true }).click();
  await expect(progress).not.toBeVisible();
  await page.evaluate(() => {
    window.feedbackAttempts[0].context.reportProgress({ loaded: 10, total: 10 });
    window.feedbackAttempts[0].fail(new Error('late failure'));
  });
  await expect(form(page).getByRole('button', { name: 'Повторить загрузку', exact: true })).not.toBeVisible();
  await expect(form(page).locator('.mw-form-status')).toContainText('отменена');
  expect(await page.evaluate(() => ({ aborted: window.feedbackAttempts[0].context.signal.aborted, undo: window.editor.canUndo() }))).toEqual({ aborted: true, undo: false });
});

test('replacement, readonly and IME invalidate failed-file retry even through retained controls', async ({ page }) => {
  for (const reason of ['replace', 'readonly', 'composition']) {
    await initialize(page);
    await upload(page);
    await expect.poll(() => page.evaluate(() => window.feedbackAttempts.length)).toBe(1);
    await page.evaluate(() => window.feedbackAttempts[0].fail(new Error('retryable')));
    await expect(retry(page)).toBeVisible();
    const retained = await retry(page).elementHandle();
    await page.evaluate((reason) => {
      if (reason === 'replace') window.editor.setHTML('<p>External</p>');
      if (reason === 'readonly') { window.editor.setReadOnly(true); window.editor.setReadOnly(false); }
      if (reason === 'composition') {
        window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      }
    }, reason);
    await retained!.evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await expect(retry(page)).not.toBeVisible();
    expect(await page.evaluate(() => ({ calls: window.feedbackAttempts.length, images: window.editor.surface.querySelectorAll('img').length }))).toEqual({ calls: 1, images: 0 });
    await retained!.dispose();
  }
});

test('retry focus cannot redirect an old file into externally replaced content', async ({ page }) => {
  await initialize(page);
  await upload(page);
  await expect.poll(() => page.evaluate(() => window.feedbackAttempts.length)).toBe(1);
  await page.evaluate(() => window.feedbackAttempts[0].fail(new Error('retryable')));
  await expect(retry(page)).toBeVisible();
  await form(page).getByLabel('Alt', { exact: true }).focus();
  await page.evaluate(() => window.editor.surface.addEventListener('focusin', () => window.editor.setHTML('<p>External replacement</p>'), { once: true }));
  await retry(page).click();
  await expect(page.locator('.upload-feedback-editor .mw-content')).toHaveText('External replacement');
  expect(await page.evaluate(() => ({ calls: window.feedbackAttempts.length, images: window.editor.surface.querySelectorAll('img').length, undo: window.editor.canUndo() }))).toEqual({ calls: 1, images: 0, undo: false });
});

test('destroying a superseded form cannot abort a sibling upload or expose uploads in edit mode', async ({ page }) => {
  await initialize(page);
  await page.evaluate(async () => {
    const path = '/packages/plugins/dist/ui/images.js';
    const { createImageForm } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/images');
    const second = document.createElement('div');
    second.className = 'upload-feedback-other-form';
    const edit = document.createElement('div');
    edit.className = 'upload-feedback-edit-form';
    document.body.append(second, edit);
    window.feedbackOtherForm = createImageForm(second, window.editor);
    createImageForm(edit, window.editor, { mode: 'edit' });
  });
  await expect(page.locator('.upload-feedback-edit-form input[type=file], .upload-feedback-edit-form progress, .upload-feedback-edit-form [data-mw-image-retry]')).toHaveCount(0);
  await upload(page);
  await expect.poll(() => page.evaluate(() => window.feedbackAttempts.length)).toBe(1);
  const other = page.locator('.upload-feedback-other-form');
  await other.getByLabel('Image file', { exact: true }).setInputFiles({ name: 'other.png', mimeType: 'image/png', buffer: Buffer.from('other') });
  await expect.poll(() => page.evaluate(() => window.feedbackAttempts.length)).toBe(2);
  await page.evaluate(() => {
    window.feedbackForm.destroy();
    window.feedbackAttempts[0].context.reportProgress({ loaded: 10, total: 10 });
    window.feedbackAttempts[0].fail(new Error('late sibling failure'));
    window.feedbackAttempts[1].context.reportProgress({ loaded: 2, total: 4 });
  });
  const progress = other.getByRole('progressbar', { name: 'Image upload progress', exact: true });
  expect(await progress.evaluate((node) => (node as HTMLProgressElement).value)).toBe(50);
  expect(await page.evaluate(() => window.feedbackAttempts[1].context.signal.aborted)).toBe(false);
  await page.evaluate(() => window.feedbackAttempts[1].finish({ src: '/logo.svg', alt: 'Sibling' }));
  await expect(page.locator('.upload-feedback-editor img')).toHaveAttribute('alt', 'Sibling');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
});
