import { expect, test } from '@playwright/test';
import { initializeUploadFeedback } from './image-upload-feedback.fixture.js';

test('upload reports validated immutable byte snapshots without committing transfer progress', async ({ page }) => {
  await initializeUploadFeedback(page);
  const result = await page.evaluate(async () => {
    const pending = window.feedbackAPI.upload(new File(['png'], 'image.png', { type: 'image/png' }), {
      onProgress: (value) => window.feedbackReports.push(value),
    });
    await Promise.resolve();
    const attempt = window.feedbackAttempts[0];
    const input = { loaded: 3, total: 10 };
    attempt.context.reportProgress({ loaded: 0 });
    attempt.context.reportProgress(input);
    input.loaded = 9;
    for (const value of [null, [], { loaded: -1 }, { loaded: NaN }, { loaded: 1.5 }, { loaded: Number.MAX_SAFE_INTEGER + 1 },
      { loaded: 4, total: 0 }, { loaded: 11, total: 10 }, { loaded: 2, total: 10 }, { loaded: 4, total: Infinity }])
      attempt.context.reportProgress(value as import('@morfira-dev/wysiwyg/plugins/images').ImageUploadProgress);
    attempt.context.reportProgress({ loaded: 10, total: 10 });
    const before = { images: window.editor.surface.querySelectorAll('img').length, changes: window.changes.length, undo: window.editor.canUndo() };
    const reports = window.feedbackReports.map((value) => ({ ...value }));
    const frozen = window.feedbackReports.every(Object.isFrozen);
    attempt.finish({ src: '/logo.svg', alt: 'Uploaded' });
    const inserted = await pending;
    attempt.context.reportProgress({ loaded: 12, total: 12 });
    return { reports, frozen, before, inserted, afterReports: window.feedbackReports.length, changes: window.changes.length };
  });
  expect(result).toEqual({ reports: [{ loaded: 0 }, { loaded: 3, total: 10 }, { loaded: 10, total: 10 }], frozen: true,
    before: { images: 0, changes: 0, undo: false }, inserted: true, afterReports: 3, changes: 1 });
});

test('cancelled and superseded progress stays scoped and old signals cannot cancel a newer upload', async ({ page }) => {
  await initializeUploadFeedback(page);
  const result = await page.evaluate(async () => {
    const file = new File(['png'], 'image.png', { type: 'image/png' });
    const own = new AbortController();
    const oldReports: number[] = [];
    const freshReports: number[] = [];
    const first = window.feedbackAPI.upload(file, { signal: own.signal, onProgress: (value) => oldReports.push(value.loaded) });
    await Promise.resolve();
    window.feedbackAttempts[0].context.reportProgress({ loaded: 1 });
    const second = window.feedbackAPI.upload(file, { onProgress: (value) => freshReports.push(value.loaded) });
    await Promise.resolve();
    own.abort();
    window.feedbackAttempts[0].context.reportProgress({ loaded: 2 });
    window.feedbackAttempts[1].context.reportProgress({ loaded: 3 });
    window.feedbackAttempts[0].finish({ src: '/logo.svg?old' });
    window.feedbackAttempts[1].finish({ src: '/logo.svg?new' });
    const outcomes = [await first, await second];
    return { oldReports, freshReports, outcomes, signals: window.feedbackAttempts.map((attempt) => attempt.context.signal.aborted), html: window.editor.getHTML() };
  });
  expect(result.oldReports).toEqual([1]);
  expect(result.freshReports).toEqual([3]);
  expect(result.outcomes).toEqual([false, true]);
  expect(result.signals).toEqual([true, false]);
  expect(result.html).toContain('/logo.svg?new');
  expect(result.html).not.toContain('/logo.svg?old');
});

test('throwing and rejecting progress observers cannot fail insertion or leak rejected promises', async ({ page }) => {
  await initializeUploadFeedback(page);
  const result = await page.evaluate(async () => {
    const unhandled: string[] = [];
    const onUnhandled = (event: PromiseRejectionEvent) => { unhandled.push(String(event.reason)); event.preventDefault(); };
    window.addEventListener('unhandledrejection', onUnhandled);
    try {
      let calls = 0;
      const pending = window.feedbackAPI.upload(new File(['png'], 'image.png', { type: 'image/png' }), { onProgress: () => {
        calls++;
        if (calls === 1) throw new Error('observer failed');
        return Promise.reject(new Error('async observer failed'));
      } });
      await Promise.resolve();
      const attempt = window.feedbackAttempts[0];
      attempt.context.reportProgress({ loaded: 1 });
      attempt.context.reportProgress({ loaded: 2 });
      attempt.finish({ src: '/logo.svg' });
      const outcome = await pending;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return { calls, outcome, unhandled, images: window.editor.surface.querySelectorAll('img').length };
    }
    finally { window.removeEventListener('unhandledrejection', onUnhandled); }
  });
  expect(result).toEqual({ calls: 2, outcome: true, unhandled: [], images: 1 });
});

test('document replacement, readonly, IME and destruction suppress late progress and results', async ({ page }) => {
  await initializeUploadFeedback(page);
  const results = await page.evaluate(async () => {
    const results: { reports: number; outcome: boolean; unchanged: boolean; aborted: boolean }[] = [];
    for (const reason of ['replace', 'readonly', 'composition', 'destroy']) {
      window.editor.setHTML('<p>Ready</p>');
      window.editor.setSelection(2);
      let reports = 0;
      const pending = window.feedbackAPI.upload(new File(['png'], 'image.png', { type: 'image/png' }), { onProgress: () => { reports++; } });
      await Promise.resolve();
      const attempt = window.feedbackAttempts.at(-1)!;
      if (reason === 'replace') window.editor.setHTML('<p>External</p>');
      if (reason === 'readonly') window.editor.setReadOnly(true);
      if (reason === 'composition') window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const expected = window.editor.getHTML();
      if (reason === 'destroy') window.editor.destroy();
      attempt.context.reportProgress({ loaded: 1, total: 1 });
      attempt.finish({ src: '/logo.svg' });
      const outcome = await pending;
      results.push({ reports, outcome, aborted: attempt.context.signal.aborted, unchanged: reason === 'destroy' || window.editor.getHTML() === expected });
      if (reason === 'readonly') window.editor.setReadOnly(false);
      if (reason === 'composition') window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    }
    return results;
  });
  expect(results).toEqual(Array.from({ length: 4 }, () => ({ reports: 0, outcome: false, unchanged: true, aborted: true })));
});

test('100 percent never bypasses uploaded URL validation and failed requests stop reporting', async ({ page }) => {
  await initializeUploadFeedback(page);
  const result = await page.evaluate(async () => {
    const before = window.editor.getHTML();
    const pending = window.feedbackAPI.upload(new File(['png'], 'image.png', { type: 'image/png' }), {
      onProgress: (value) => window.feedbackReports.push(value),
    }).then(() => 'success', () => 'rejected');
    await Promise.resolve();
    const attempt = window.feedbackAttempts[0];
    attempt.context.reportProgress({ loaded: 3, total: 3 });
    attempt.finish({ src: 'javascript:alert(1)' });
    const outcome = await pending;
    attempt.context.reportProgress({ loaded: 4, total: 4 });
    return { outcome, reports: window.feedbackReports.length, unchanged: before === window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ outcome: 'rejected', reports: 1, unchanged: true, undo: false });
});

test('a request started synchronously by an abort listener keeps ownership over the interrupted caller', async ({ page }) => {
  await initializeUploadFeedback(page);
  const result = await page.evaluate(async () => {
    const file = new File(['png'], 'image.png', { type: 'image/png' });
    const first = window.feedbackAPI.upload(file);
    await Promise.resolve();
    const reentrant: Promise<boolean>[] = [];
    window.feedbackAttempts[0].context.signal.addEventListener('abort', () => {
      reentrant.push(window.feedbackAPI.upload(file, { onProgress: (value) => window.feedbackReports.push(value) }));
    }, { once: true });
    const interrupted = window.feedbackAPI.upload(file);
    await Promise.resolve();
    const current = window.feedbackAttempts.at(-1)!;
    current.context.reportProgress({ loaded: 1, total: 1 });
    current.finish({ src: '/logo.svg?reentrant', alt: 'Reentrant' });
    const outcomes = [await first, await interrupted, await reentrant[0]];
    return { outcomes, calls: window.feedbackAttempts.length, reports: window.feedbackReports.length,
      src: window.editor.surface.querySelector('img')?.getAttribute('src'), changes: window.changes.length };
  });
  expect(result).toEqual({ outcomes: [false, false, true], calls: 2, reports: 1, src: '/logo.svg?reentrant', changes: 1 });
});

test('successful transport cannot restore its old insertion range after focus replaces the document', async ({ page }) => {
  await initializeUploadFeedback(page);
  const result = await page.evaluate(async () => {
    const pending = window.feedbackAPI.upload(new File(['png'], 'image.png', { type: 'image/png' }));
    await Promise.resolve();
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    window.editor.surface.addEventListener('focusin', () => window.editor.setHTML('<p>External replacement</p>'), { once: true });
    window.feedbackAttempts[0].finish({ src: '/logo.svg' });
    const outcome = await pending;
    return { outcome, html: window.editor.getHTML(), undo: window.editor.canUndo(), images: window.editor.surface.querySelectorAll('img').length };
  });
  expect(result).toEqual({ outcome: false, html: '<p>External replacement</p>', undo: false, images: 0 });
});
