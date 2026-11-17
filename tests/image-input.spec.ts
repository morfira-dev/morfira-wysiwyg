import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './image-input.types.js';

const content = (page: Page) => page.locator('.image-input-editor .mw-content');
const initialize = async (page: Page, value = '<p>abcdef</p>', rejectErrors = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, rejectErrors }) => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'image-input-editor';
    document.body.prepend(host);
    const path = '/packages/plugins/dist/image-input.js';
    const { imageInput } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/image-input');
    window.inputImageResults = [];
    window.inputImageFailures = [];
    window.inputImageSignals = [];
    window.inputImageErrors = [];
    window.editor = window.createEditor(host, {
      value,
      plugins: [window.createTables(), window.createImages({
        maxFileSize: 16,
        upload: (_file, { signal }) => {
          window.inputImageSignals.push(signal);
          return new Promise((resolve, reject) => {
            window.inputImageResults.push(resolve);
            window.inputImageFailures.push(reject);
          });
        },
      }), imageInput({ onError: (error) => {
        window.inputImageErrors.push(String(error));
        if (rejectErrors) return Promise.reject(new Error('Error presentation failed'));
      } })],
    });
    window.editor.setSelection(2, 2);
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, { value, rejectErrors });
};

const paste = (page: Page, options: { type?: string; count?: number; html?: string; size?: number; cancelled?: boolean } = {}) => page.evaluate((options) => {
  const transfer = new DataTransfer();
  for (let index = 0; index < (options.count ?? 1); index++)
    transfer.items.add(new File(['x'.repeat(options.size ?? 3)], 'image.png', { type: options.type ?? 'image/png' }));
  if (options.html) transfer.setData('text/html', options.html);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: transfer });
  if (options.cancelled) event.preventDefault();
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, options);

const complete = async (page: Page, index = 0, src = '/logo.svg') => {
  await expect.poll(() => page.evaluate(() => window.inputImageResults.length)).toBeGreaterThan(index);
  await page.evaluate(({ index, src }) => window.inputImageResults[index]({ src, alt: 'Uploaded' }), { index, src });
};

test('file paste replaces same-block text at its saved range with one undo transaction', async ({ page }) => {
  await initialize(page);
  expect(await paste(page)).toBe(true);
  await page.evaluate(() => window.editor.setSelection(6));
  await complete(page);
  await expect(content(page).locator('figure img')).toHaveAttribute('alt', 'Uploaded');
  await expect(content(page).locator('p')).toHaveText(['ab', 'ef']);
  await page.evaluate(() => window.editor.undo());
  await expect(content(page)).toHaveText('abcdef');
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ selection: { index: 2, length: 2 }, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect(content(page).locator('img')).toHaveCount(1);
});

test('a singleton empty text block accepts native surface boundaries without accepting ambiguous root positions', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    window.editor.setHTML('<p><br></p>');
    const range = document.createRange();
    range.setStart(window.editor.surface, 0);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  const empty = await content(page).innerHTML();
  await paste(page);
  await complete(page);
  await expect(content(page).locator('img')).toHaveCount(1);
  await page.evaluate(() => window.editor.undo());
  expect(await content(page).innerHTML()).toBe(empty);
  await page.evaluate(() => {
    window.editor.setHTML('<h2><br></h2>');
    const range = document.createRange();
    range.setStart(window.editor.surface, 1);
    range.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => range });
    const transfer = new DataTransfer();
    transfer.items.add(new File(['png'], 'empty.png', { type: 'image/png' }));
    window.editor.surface.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await complete(page, 1);
  await expect(content(page).locator('img')).toHaveCount(1);
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('h2')).toHaveCount(1);
  for (const html of ['<p>Text</p>', '<p><br></p><p><br></p>']) {
    await page.evaluate((html) => {
      window.editor.setHTML(html);
      const range = document.createRange();
      range.setStart(window.editor.surface, 0);
      range.collapse(true);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    }, html);
    const before = await content(page).innerHTML();
    await paste(page);
    expect(await content(page).innerHTML()).toBe(before);
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  }
  await page.evaluate(() => {
    window.editor.setHTML('<p><br></p>');
    window.editor.surface.querySelector('br')!.setAttribute('contenteditable', 'false');
    const range = document.createRange();
    range.setStart(window.editor.surface, 0);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await paste(page);
  expect(await page.evaluate(() => window.inputImageSignals.length)).toBe(2);
});

test('file ownership precedes tables capture and ignores accompanying rich markup', async ({ page }) => {
  await initialize(page);
  await paste(page, { html: '<table><tbody><tr><td>Must not paste</td></tr></tbody></table><img src="javascript:alert(1)">' });
  await complete(page);
  await expect(content(page).locator('img')).toHaveAttribute('src', '/logo.svg');
  await expect(content(page).locator('table')).toHaveCount(0);
  await expect(content(page)).not.toContainText('Must not paste');
  expect(await page.evaluate(() => window.inputImageSignals.length)).toBe(1);
});

test('no-file HTML retains the ordinary paste path and pre-cancelled files do not upload', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/image-input.js';
    const { imageInput } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/image-input');
    return [null, [], 'bad', { unknown: true }, { onError: 42 }].map((value) => {
      try { imageInput(value as never); return false; }
      catch { return true; }
    });
  })).toEqual([true, true, true, true, true]);
  await paste(page, { count: 0, html: '<strong>Text</strong>' });
  await expect(content(page).locator('strong')).toHaveText('Text');
  expect(await paste(page, { cancelled: true })).toBe(true);
  expect(await page.evaluate(() => window.inputImageSignals.length)).toBe(0);
});

test('drop focus callbacks cannot retarget insertion and focus replacement blocks upload', async ({ page }) => {
  await initialize(page);
  const blurToControl = async () => {
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.dataset.inputFocusControl = '';
      button.textContent = 'Outside editor';
      document.body.append(button);
      button.focus();
    });
    await expect(page.locator('[data-input-focus-control]').last()).toBeFocused();
  };
  // A drop resolves a point even when WebKit clears native selection on blur.
  // Its actual browser point API is exercised by the independent pointer test.
  const dropAtTwo = () => page.evaluate(() => {
    const range = document.createRange();
    range.setStart(window.editor.surface.querySelector('p')!.firstChild!, 2);
    range.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => range });
    const transfer = new DataTransfer();
    transfer.items.add(new File(['png'], 'focus.png', { type: 'image/png' }));
    window.editor.surface.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await blurToControl();
  await page.evaluate(() => window.editor.surface.addEventListener('focus', () => {
    window.editor.element.dataset.selectionFocus = 'fired';
    window.editor.setSelection(6);
  }, { once: true }));
  await dropAtTwo();
  expect(await page.evaluate(() => window.editor.element.dataset.selectionFocus)).toBe('fired');
  await complete(page);
  await expect(content(page).locator('p')).toHaveText(['ab', 'cdef']);
  await page.evaluate(() => window.editor.setHTML('<p>abcdef</p>'));
  await blurToControl();
  await page.evaluate(() => window.editor.surface.addEventListener('focus', () => {
    window.editor.element.dataset.replaceFocus = 'fired';
    window.editor.setHTML('<p>Focus replacement</p>');
  }, { once: true }));
  await dropAtTwo();
  expect(await page.evaluate(() => window.editor.element.dataset.replaceFocus)).toBe('fired');
  await expect(content(page)).toHaveText('Focus replacement');
  expect(await page.evaluate(() => window.inputImageSignals.length)).toBe(1);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('multiple, SVG, empty and oversized files are consumed without mutation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page, '<p>abcdef</p>', true);
  for (const options of [{ count: 2 }, { type: 'image/svg+xml' }, { size: 0 }, { size: 17 }]) {
    expect(await paste(page, options)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.inputImageErrors.length)).toBeGreaterThan(0);
    await expect(content(page)).toHaveText('abcdef');
    expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  }
  expect(await page.evaluate(() => window.inputImageSignals.length)).toBe(0);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(errors).toEqual([]);
});

test('cross-block, protected, semantic and foreign ranges refuse before upload', async ({ page }) => {
  await initialize(page, '<p>abc</p><p>def</p>');
  const before = await page.evaluate(() => { window.editor.setSelection(1, 4); return window.editor.getSelection(); });
  await paste(page);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual(before);
  await page.evaluate(() => {
    window.editor.setSelection(1);
    window.editor.surface.querySelector('p')!.setAttribute('contenteditable', 'false');
  });
  await paste(page);
  for (const namespace of ['http://www.w3.org/2000/svg', 'http://www.w3.org/1998/Math/MathML']) {
    const before = await page.evaluate((namespace) => {
      const paragraph = window.editor.surface.querySelector('p')!;
      paragraph.removeAttribute('contenteditable');
      paragraph.removeAttribute('data-mw-node');
      const foreign = document.createElementNS(namespace, namespace.endsWith('svg') ? 'svg' : 'math');
      paragraph.append(foreign);
      const range = document.createRange();
      range.selectNode(foreign);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return window.editor.surface.innerHTML;
    }, namespace);
    await paste(page);
    expect(await content(page).innerHTML()).toBe(before);
    await page.evaluate(() => window.editor.surface.querySelector('svg,math')?.remove());
  }
  await page.evaluate(() => {
    const paragraph = window.editor.surface.querySelector('p')!;
    paragraph.removeAttribute('contenteditable');
    paragraph.setAttribute('data-mw-node', 'application-owned');
  });
  await paste(page);
  await page.evaluate(() => {
    const foreign = document.createElement('p');
    foreign.textContent = 'Outside';
    document.body.append(foreign);
    const range = document.createRange();
    range.selectNodeContents(foreign);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await paste(page);
  expect(await page.evaluate(() => window.inputImageSignals.length)).toBe(0);
  await expect(content(page).locator('img')).toHaveCount(0);
});

test('protected-mode file dragover is consumed even with an empty readable file list', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['svg'], 'bad.svg', { type: 'image/svg+xml' }));
    Object.defineProperty(transfer, 'files', { value: [] });
    const event = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  expect(await page.evaluate(() => window.inputImageSignals.length)).toBe(0);
});

test('drop uses its native pointer caret instead of the previous selection', async ({ page }) => {
  await initialize(page);
  const supported = await content(page).locator('p').evaluate((element) => {
    const owner = document as Document & { caretRangeFromPoint?: unknown; caretPositionFromPoint?: unknown };
    if (!owner.caretRangeFromPoint && !owner.caretPositionFromPoint) return false;
    window.editor.setSelection(6);
    const point = document.createRange();
    point.setStart(element.firstChild!, 2);
    point.collapse(true);
    const bounds = point.getBoundingClientRect();
    const transfer = new DataTransfer();
    transfer.items.add(new File(['png'], 'drop.png', { type: 'image/png' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: bounds.left, clientY: bounds.top + bounds.height / 2 }));
    return true;
  });
  test.skip(!supported, 'Browser does not expose a native caret-at-point API.');
  await complete(page);
  await expect(content(page).locator('p')).toHaveText(['ab', 'cdef']);
});

test('drop outside a text target is consumed and never falls back to old caret', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['png'], 'drop.png', { type: 'image/png' }));
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: -1000, clientY: -1000 });
    window.editor.surface.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  expect(await page.evaluate(() => window.inputImageSignals.length)).toBe(0);
  await expect(content(page)).toHaveText('abcdef');
});

test('read-only and composition consume files without transport or selection changes', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await paste(page);
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
  await paste(page);
  expect(await page.evaluate(() => ({ calls: window.inputImageSignals.length, selection: window.editor.getSelection() }))).toEqual({ calls: 0, selection: { index: 2, length: 2 } });
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setReadOnly(false);
  });
  await paste(page);
  await complete(page);
  await expect(content(page).locator('img')).toHaveCount(1);
  await expect(content(page).locator('p')).toHaveText(['ab', 'ef']);
});

test('late upload after API replacement is cancelled; unsafe result and rejection are reported', async ({ page }) => {
  await initialize(page);
  await paste(page);
  await expect.poll(() => page.evaluate(() => window.inputImageSignals.length)).toBe(1);
  await page.evaluate(() => { window.editor.setHTML('<p>External</p>'); window.inputImageResults[0]({ src: '/late' }); window.editor.setSelection(2); });
  await expect(content(page)).toHaveText('External');
  expect(await page.evaluate(() => window.inputImageSignals[0].aborted)).toBe(true);
  await paste(page);
  await complete(page, 1, 'javascript:alert(1)');
  await expect.poll(() => page.evaluate(() => window.inputImageErrors.length)).toBe(1);
  await paste(page);
  await expect.poll(() => page.evaluate(() => window.inputImageFailures.length)).toBe(3);
  await page.evaluate(() => window.inputImageFailures[2](new Error('Storage failed')));
  await expect.poll(() => page.evaluate(() => window.inputImageErrors.length)).toBe(2);
  await expect(content(page)).toHaveText('External');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('destroy aborts owned upload and removes input listeners', async ({ page }) => {
  await initialize(page);
  await paste(page);
  await expect.poll(() => page.evaluate(() => window.inputImageSignals.length)).toBe(1);
  expect(await page.evaluate(() => {
    const surface = window.editor.surface;
    window.editor.destroy();
    window.inputImageFailures[0](new Error('Late rejection'));
    const transfer = new DataTransfer();
    transfer.items.add(new File(['png'], 'late.png', { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    surface.dispatchEvent(event);
    return { aborted: window.inputImageSignals[0].aborted, prevented: event.defaultPrevented, calls: window.inputImageSignals.length };
  })).toEqual({ aborted: true, prevented: false, calls: 1 });
  expect(await page.evaluate(() => window.inputImageErrors)).toEqual([]);
});
