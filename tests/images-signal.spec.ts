import { expect, test } from '@playwright/test';
import type { ImageValue } from '@morfira-dev/wysiwyg/plugins/images';

test('a caller abort signal cancels only its own image upload and settled listeners are removed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const result = await page.evaluate(async () => {
    window.dispose();
    const signals: AbortSignal[] = [];
    const completions: ((value: ImageValue) => void)[] = [];
    const editor = window.createEditor(document.createElement('div'), { value: '<p>Start</p>', plugins: [window.createImages({ upload: (_file, { signal }) => {
      signals.push(signal);
      return new Promise((resolve) => completions.push(resolve));
    } })] });
    document.body.append(editor.element);
    const api = window.imageCommands(editor);
    editor.setSelection(5);
    const first = new AbortController();
    let removed = 0;
    const remove = first.signal.removeEventListener.bind(first.signal);
    first.signal.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      removed++;
      remove(type, listener, options);
    };
    const file = new File(['png'], 'image.png', { type: 'image/png' });
    const one = api.upload(file, { signal: first.signal });
    await Promise.resolve();
    const two = api.upload(file);
    await Promise.resolve();
    first.abort();
    completions[1]({ src: '/logo.svg', alt: 'Second' });
    const outcomes = [await one, await two];
    const aborted = signals.map((signal) => signal.aborted);
    const html = editor.getHTML();
    editor.destroy();
    return { outcomes, aborted, html, removed };
  });
  expect(result.outcomes).toEqual([false, true]);
  expect(result.aborted).toEqual([true, false]);
  expect(result.html).toContain('alt="Second"');
  expect(result.removed).toBe(1);
});

test('already aborted upload signals leave an application request and its insertion untouched', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const result = await page.evaluate(async () => {
    window.dispose();
    let finish: ((value: ImageValue) => void) | undefined;
    let activeSignal: AbortSignal | undefined;
    const editor = window.createEditor(document.createElement('div'), { value: '<p>Start</p>', plugins: [window.createImages({ upload: (_file, { signal }) => {
      activeSignal = signal;
      return new Promise((resolve) => finish = resolve);
    } })] });
    document.body.append(editor.element);
    editor.setSelection(5);
    const api = window.imageCommands(editor);
    const file = new File(['png'], 'image.png', { type: 'image/png' });
    const pending = api.upload(file);
    await Promise.resolve();
    const aborted = new AbortController();
    aborted.abort();
    const skipped = await api.upload(file, { signal: aborted.signal });
    const preserved = !activeSignal!.aborted && api.isUploading();
    finish!({ src: '/logo.svg' });
    const inserted = await pending;
    editor.destroy();
    return { skipped, preserved, inserted };
  });
  expect(result).toEqual({ skipped: false, preserved: true, inserted: true });
});
