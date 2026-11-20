import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SaveTestOptions } from './save-state.types.js';
import './save-state.types.js';

const initialize = async (page: Page, options: SaveTestOptions = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (options) => {
    window.dispose();
    const behaviorPath = '/packages/wysiwyg/dist/plugins/save-state.js';
    const uiPath = '/packages/wysiwyg/dist/ui/save-state.js';
    window.saveModule = await import(/* @vite-ignore */ behaviorPath) as typeof import('@morfira-dev/wysiwyg/plugins/save-state');
    window.saveUIModule = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/save-state');
    window.saveProbe = { mode: options.mode ?? 'pending', requests: [], errors: [], reads: 0 };
    window.saveHook = undefined;
    const target = document.createElement('div');
    target.className = 'save-state-test';
    const host = document.createElement('div');
    host.className = 'save-state-host';
    document.body.prepend(target, host);
    const persist = (value: import('@morfira-dev/wysiwyg').EditorDocument, context: import('@morfira-dev/wysiwyg/plugins/save-state').SaveStateContext) => {
      let resolve: () => void = () => {};
      let reject: (error: unknown) => void = () => {};
      const pending = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
      // Even immediate modes retain their probe promise with a rejection handler.
      void pending.catch(() => {});
      window.saveProbe.requests.push({ document: value, signal: context.signal, revision: context.revision, resolve, reject });
      window.saveHook?.();
      if (window.saveProbe.mode === 'throw') throw new Error('backend secret');
      if (window.saveProbe.mode === 'reject') return Promise.reject(new Error('backend secret'));
      if (window.saveProbe.mode === 'mutate') value.children.splice(0);
      return window.saveProbe.mode === 'pending' ? pending : undefined;
    };
    window.changes = [];
    window.editor = window.createEditor(target, {
      value: '<p>XY</p>', locale: 'en', plugins: [window.saveModule.saveState({ save: persist, autoSave: options.autoSave, debounceMs: options.debounceMs, onError: (error) => { window.saveProbe.errors.push(String(error)); } })],
      onChange: (change) => window.changes.push(change),
    });
    window.saveAPI = window.saveModule.saveStateCommands(window.editor);
    window.saveUI = window.saveUIModule.createSaveStateUI(host, window.editor);
    window.editor.focus(); window.editor.setSelection(1);
    window.dispose = () => { window.saveUI.destroy(); window.editor.destroy(); target.remove(); host.remove(); };
  }, options);
};
const state = (page: Page) => page.evaluate(() => window.saveAPI.getState());
const edit = (page: Page, value = '!') => page.evaluate((value) => window.editor.insertHTML(value), value);
const ui = (page: Page) => page.locator('.save-state-host');

// Each case groups one actual behavior risk, rather than crossing every status
// with every browser operation and backend callback variant.
test('revision acknowledgement observes transactions and history without mutating document or selection', async ({ page }) => {
  await initialize(page);
  expect(await state(page)).toEqual({ status: 'saved', dirty: false, revision: 0, savedRevision: 0 });
  expect(await page.evaluate(() => {
    let delivered = 0;
    const stop = window.saveAPI.subscribe(() => { delivered++; });
    stop(); stop();
    return { delivered, frozen: Object.isFrozen(window.saveAPI.getState()) };
  })).toEqual({ delivered: 1, frozen: true });
  await edit(page);
  await page.evaluate(() => window.editor.setHTML(window.editor.getHTML()));
  expect(await state(page)).toEqual({ status: 'dirty', dirty: true, revision: 1, savedRevision: 0 });
  const acknowledgement = await page.evaluate(() => {
    window.editor.undo();
    const before = { html: window.editor.getHTML(), selection: window.editor.getSelection(), redo: window.editor.canRedo() };
    window.saveAPI.markSaved();
    return { before, after: { html: window.editor.getHTML(), selection: window.editor.getSelection(), redo: window.editor.canRedo() }, state: window.saveAPI.getState() };
  });
  expect(acknowledgement).toMatchObject({ state: { status: 'saved', dirty: false, revision: 2, savedRevision: 2 }, before: { html: '<p>XY</p>', redo: true } });
  expect(acknowledgement.after).toEqual(acknowledgement.before);
  expect(await page.evaluate(() => window.saveProbe.requests.length)).toBe(0);
});

test('one in-flight save coalesces callers and acknowledges only the captured revision when editing continues', async ({ page }) => {
  await initialize(page);
  await edit(page);
  expect(await page.evaluate(() => {
    const first = window.saveAPI.save();
    window.savePending = first;
    return first === window.saveAPI.save() && first === window.saveAPI.retry();
  })).toBe(true);
  await edit(page, 'Z');
  expect(await state(page)).toEqual({ status: 'saving', dirty: true, revision: 2, savedRevision: 0 });
  expect(await page.evaluate(async () => { window.saveProbe.requests[0].resolve(); return window.savePending; })).toBe(true);
  expect(await state(page)).toEqual({ status: 'dirty', dirty: true, revision: 2, savedRevision: 1 });
  expect(await page.evaluate(() => { window.savePending = window.saveAPI.save(); return window.saveProbe.requests.map((request) => request.revision); })).toEqual([1, 2]);
  expect(await page.evaluate(async () => { window.saveProbe.requests[1].resolve(); return window.savePending; })).toBe(true);
  expect(await state(page)).toEqual({ status: 'saved', dirty: false, revision: 2, savedRevision: 2 });
  expect(await page.evaluate(() => window.changes.filter((change) => change.source === 'user').length)).toBe(2);
});

test('errors stay generic in localized UI and native retry saves without changing content or history', async ({ page }) => {
  await initialize(page, { mode: 'reject' });
  await edit(page);
  await ui(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ui(page).getByRole('status')).toHaveText('Save failed. Try again.');
  await expect(ui(page)).not.toContainText('backend secret');
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(ui(page).getByRole('status')).toHaveText('Не удалось сохранить. Повторите попытку.');
  const before = await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() }));
  await page.evaluate(() => { window.saveProbe.mode = 'resolve'; });
  await ui(page).getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(ui(page).getByRole('status')).toHaveText('Сохранено');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual(before);
  await edit(page, 'new');
  expect(await page.evaluate(async () => { window.saveProbe.mode = 'throw'; return window.saveAPI.save(); })).toBe(false);
  expect((await state(page)).status).toBe('error');
});

test('replacement, explicit acknowledgement and disposal promptly cancel callbacks that ignore abort and consume late rejection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await initialize(page);
  await edit(page);
  await page.evaluate(() => { window.savePending = window.saveAPI.save(); window.editor.setHTML('<p>Replacement</p>'); });
  expect(await page.evaluate(() => window.savePending)).toBe(false);
  expect(await page.evaluate(() => window.saveProbe.requests[0].signal.aborted)).toBe(true);
  await page.evaluate(() => window.saveProbe.requests[0].reject(new Error('late ignored rejection')));
  expect(await state(page)).toEqual({ status: 'saved', dirty: false, revision: 2, savedRevision: 2 });
  await edit(page);
  await page.evaluate(() => { window.savePending = window.saveAPI.save(); window.saveAPI.markSaved(); });
  expect(await page.evaluate(() => window.savePending)).toBe(false);
  await page.evaluate(() => window.saveProbe.requests[1].resolve());
  expect((await state(page)).dirty).toBe(false);
  await edit(page);
  await page.evaluate(() => {
    window.savePending = window.saveAPI.save();
    window.saveProbe.requests[2].signal.addEventListener('abort', () => {
      window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    window.editor.destroy();
  });
  expect(await page.evaluate(() => window.savePending)).toBe(false);
  expect(await page.evaluate(() => {
    window.saveProbe.requests[2].reject(new Error('late disposed rejection'));
    try { window.saveAPI.getState(); return false; } catch { return true; }
  })).toBe(true);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(errors).toEqual([]);
  await expect(ui(page).locator('.mw-save-state')).toHaveCount(0);
});

test('opt-in debounce snapshots only on dispatch and serializes later dirty intent behind the active request', async ({ page }) => {
  await initialize(page, { autoSave: true, debounceMs: 40 });
  expect(await page.evaluate(() => {
    const original = window.editor.getJSON.bind(window.editor);
    window.editor.getJSON = () => { window.saveProbe.reads++; return original(); };
    window.editor.insertHTML('A'); window.editor.insertHTML('B');
    return window.saveProbe.reads;
  })).toBe(0);
  await expect.poll(() => page.evaluate(() => window.saveProbe.requests.length)).toBe(1);
  expect(await page.evaluate(() => ({ reads: window.saveProbe.reads, revision: window.saveProbe.requests[0].revision }))).toEqual({ reads: 1, revision: 2 });
  await edit(page, 'C');
  await page.waitForTimeout(70);
  expect(await page.evaluate(() => window.saveProbe.requests.length)).toBe(1);
  await page.evaluate(() => window.saveProbe.requests[0].resolve());
  await expect.poll(() => page.evaluate(() => window.saveProbe.requests.length)).toBe(2);
  expect(await page.evaluate(() => window.saveProbe.requests[1].revision)).toBe(3);
  await page.evaluate(() => window.saveProbe.requests[1].resolve());
  await expect.poll(() => state(page)).toMatchObject({ status: 'saved', dirty: false, revision: 3, savedRevision: 3 });
});

test('IME never captures provisional content and API or readonly cancellation recovers without compositionend', async ({ page }) => {
  await initialize(page, { autoSave: true, debounceMs: 0 });
  expect(await page.evaluate(async () => {
    window.editor.insertHTML('!');
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    return window.saveAPI.save();
  })).toBe(false);
  await expect(ui(page).getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.saveProbe.requests.length)).toBe(0);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect.poll(() => page.evaluate(() => window.saveProbe.requests.length)).toBe(1);
  await page.evaluate(() => window.saveProbe.requests[0].resolve());
  await expect.poll(() => state(page)).toMatchObject({ status: 'saved' });
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setHTML('<p>Fresh</p>');
    window.editor.setSelection(2);
    window.editor.insertHTML('!');
  });
  await expect.poll(() => page.evaluate(() => window.saveProbe.requests.length)).toBe(2);
  await page.evaluate(() => window.saveProbe.requests[1].resolve());
  await expect.poll(() => state(page)).toMatchObject({ status: 'saved', dirty: false });
});

test('subscriber and save callback reentrancy cannot double-submit or acknowledge a replaced baseline', async ({ page }) => {
  await initialize(page);
  await edit(page);
  expect(await page.evaluate(async () => {
    const stop = window.saveAPI.subscribe((state) => { if (state.status === 'saving') window.saveAPI.markSaved(); });
    const result = await window.saveAPI.save();
    stop();
    return { result, calls: window.saveProbe.requests.length, state: window.saveAPI.getState() };
  })).toMatchObject({ result: false, calls: 0, state: { status: 'saved', dirty: false } });
  await edit(page);
  expect(await page.evaluate(async () => {
    window.saveHook = () => window.editor.setHTML('<p>New baseline</p>');
    const result = await window.saveAPI.save();
    window.saveProbe.requests[0].reject(new Error('stale transport failure'));
    return { result, state: window.saveAPI.getState(), html: window.editor.getHTML() };
  })).toMatchObject({ result: false, state: { status: 'saved', dirty: false }, html: '<p>New baseline</p>' });
});

test('detached snapshots, invalid setup and reused plugin instances preserve editor and controller ownership', async ({ page }) => {
  await initialize(page, { mode: 'mutate' });
  await edit(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => window.saveAPI.save())).toBe(true);
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => {
    let rejected = 0;
    for (const options of [{}, { save: () => {}, debounceMs: -1 }, { save: () => {}, debounceMs: 1.5 }, { save: () => {}, autoSave: 'true' }, { save: () => {}, url: '/unexpected' }]) {
      try { window.saveModule.saveState(options as never); } catch { rejected++; }
    }
    window.editor.insertHTML('guarded');
    const old = window.saveUI.element.querySelector<HTMLButtonElement>('button')!;
    const parent = window.editor.element.parentNode!;
    const calls = window.saveProbe.requests.length;
    window.editor.element.remove(); old.click(); window.saveUI.refresh();
    const detached = old.disabled && window.saveProbe.requests.length === calls;
    parent.appendChild(window.editor.element); window.saveUI.refresh();
    try { window.saveUIModule.createSaveStateUI(window.editor.surface, window.editor); } catch { rejected++; }
    window.saveUI.destroy(); old.click();
    const stale = window.saveProbe.requests.length === calls;
    const host = document.createElement('div'); document.body.append(host);
    const shared = window.saveModule.saveState({ save: () => {} });
    const aHost = document.createElement('div'); const bHost = document.createElement('div');
    document.body.append(aHost, bHost);
    const a = window.createEditor(aHost, { value: '<p>A</p>', plugins: [shared] });
    const b = window.createEditor(bHost, { value: '<p>B</p>', plugins: [shared] });
    const first = window.saveModule.saveStateCommands(a); const second = window.saveModule.saveStateCommands(b);
    a.focus(); a.setSelection(1); a.insertHTML('!');
    const independent = first.getState().dirty && !second.getState().dirty;
    const without = window.createEditor(host, { value: '<p>No plugin</p>' });
    const untouched = document.createElement('div'); document.body.append(untouched);
    try { window.saveUIModule.createSaveStateUI(untouched, without); } catch { rejected++; }
    const clean = untouched.childNodes.length === 0;
    a.destroy(); b.destroy(); without.destroy(); aHost.remove(); bHost.remove(); host.remove(); untouched.remove();
    return { rejected, independent, clean, detached, stale };
  })).toEqual({ rejected: 7, independent: true, clean: true, detached: true, stale: true });
});
