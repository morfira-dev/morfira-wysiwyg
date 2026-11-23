import { expect, test } from '@playwright/test';
import type { EditorDocument } from '@morfira-dev/wysiwyg';
import type { RecipeHighlightModule, VersionedRecipeDocument } from '../apps/docs/.vitepress/theme/recipes/types.js';
import './extension-recipes.types.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
});

test('upload recipe sends native same-origin multipart XHR and accepts only a bounded literal response', async ({ page }) => {
  const requests: { method: string; type: string; body: string }[] = [];
  await page.route('**/__recipe_upload', async (route) => {
    requests.push({ method: route.request().method(), type: route.request().headers()['content-type'] ?? '', body: route.request().postData() ?? '' });
    await route.fulfill({ json: { src: '/safe.png', alt: '<literal label>' } });
  });
  const result = await page.evaluate(async () => {
    const path = '/apps/docs/.vitepress/theme/recipes/upload.ts';
    const { createImageUpload } = await import(/* @vite-ignore */ path) as typeof import('../apps/docs/.vitepress/theme/recipes/upload.js');
    const progress: number[] = [];
    let sentFile: Promise<{ name: string; type: string; bytes: string }> | undefined;
    const nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = new Proxy(nativeSend, {
      apply: (target, receiver, args) => {
        const body = args[0] as unknown;
        const file = body instanceof FormData ? body.get('file') : undefined;
        if (file instanceof File) sentFile = file.text().then((bytes) => ({ name: file.name, type: file.type, bytes }));
        return Reflect.apply(target, receiver, args);
      },
    });
    try {
      const value = await createImageUpload('/__recipe_upload')(new File(['raster-test-bytes'], 'photo.png', { type: 'image/png' }), {
        signal: new AbortController().signal, reportProgress: (value) => progress.push(value.loaded),
      });
      return { value, progress, origin: location.origin, sentFile: await sentFile };
    }
    finally { XMLHttpRequest.prototype.send = nativeSend; }
  });
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe('POST');
  expect(requests[0].type).toContain('multipart/form-data; boundary=');
  expect(requests[0].body).toContain('filename="photo.png"');
  expect(requests[0].body).toContain('Content-Type: image/png');
  // WebKit's intercepted postData omits file bytes. Prove the actual File handed
  // to native XHR separately; retain wire-level multipart/filename/MIME checks.
  expect(result.sentFile).toEqual({ name: 'photo.png', type: 'image/png', bytes: 'raster-test-bytes' });
  expect(result.value).toEqual({ src: `${result.origin}/safe.png`, alt: '<literal label>' });
  expect(result.progress.every((loaded) => Number.isFinite(loaded) && loaded >= 0)).toBe(true);
});

test('upload cancellation and endpoint/MIME/size/response guards reject before unsafe network or rendering', async ({ page }) => {
  let foreign = 0;
  await page.route('https://outside.invalid/**', async (route) => { foreign++; await route.abort(); });
  await page.route('**/__recipe_unsafe', (route) => route.fulfill({ json: { src: 'javascript:alert(1)', alt: 'bad' } }));
  await page.route('**/__recipe_abort', () => {});
  const requested = page.waitForRequest('**/__recipe_abort');
  const pending = page.evaluate(async () => {
    const path = '/apps/docs/.vitepress/theme/recipes/upload.ts';
    const { createImageUpload } = await import(/* @vite-ignore */ path) as typeof import('../apps/docs/.vitepress/theme/recipes/upload.js');
    window.recipeUploadAbort = new AbortController();
    try {
      await createImageUpload('/__recipe_abort')(new File(['data'], 'a.png', { type: 'image/png' }), { signal: window.recipeUploadAbort.signal, reportProgress: () => {} });
      return 'resolved';
    }
    catch (error) { return error instanceof DOMException ? error.name : 'other'; }
  });
  await requested;
  await page.evaluate(() => window.recipeUploadAbort!.abort());
  expect(await pending).toBe('AbortError');
  const result = await page.evaluate(async () => {
    const path = '/apps/docs/.vitepress/theme/recipes/upload.ts';
    const { createImageUpload } = await import(/* @vite-ignore */ path) as typeof import('../apps/docs/.vitepress/theme/recipes/upload.js');
    const context = { signal: new AbortController().signal, reportProgress: () => {} };
    const png = new File(['valid'], 'a.png', { type: 'image/png' });
    let rejected = 0;
    for (const operation of [
      () => createImageUpload('https://outside.invalid/upload')(png, context),
      () => createImageUpload('/__recipe_unsafe')(png, context),
      () => createImageUpload('/__recipe_unsafe')(new File(['text'], 'a.svg', { type: 'image/svg+xml' }), context),
      () => createImageUpload('/__recipe_unsafe')(new File([new Uint8Array(5_000_001)], 'huge.png', { type: 'image/png' }), context),
    ]) {
      try { await operation(); } catch { rejected++; }
    }
    return { rejected, executableNodes: document.querySelectorAll('img[src^="javascript:"],script[data-recipe]').length };
  });
  expect(result).toEqual({ rejected: 4, executableNodes: 0 });
  expect(foreign).toBe(0);
});

test('async mention recipe preserves opaque numeric IDs, bounds copied results and cancels pending lookup', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/apps/docs/.vitepress/theme/recipes/mentions.ts';
    const { createMentionProvider } = await import(/* @vite-ignore */ path) as typeof import('../apps/docs/.vitepress/theme/recipes/mentions.js');
    const records = [{ id: '00042', label: 'Alice' }, { id: 'item_2', label: 'Alina' }];
    const provider = createMentionProvider(records, 20);
    records[0].label = 'Changed outside';
    const controller = new AbortController();
    const cancelled = Promise.resolve(provider({ query: 'Al', limit: 1, signal: controller.signal })).then(() => 'resolved', (error: unknown) => error instanceof DOMException ? error.name : 'other');
    controller.abort();
    const aborted = await cancelled;
    const matches = await provider({ query: 'Al', limit: 1, signal: new AbortController().signal });
    matches[0].label = 'Changed result';
    const next = await provider({ query: 'Ali', limit: 2, signal: new AbortController().signal });
    let invalid = false;
    try { await provider({ query: 'Ali', limit: 0, signal: new AbortController().signal }); } catch { invalid = true; }
    return { aborted, id: matches[0].id, next, invalid };
  });
  expect(result).toEqual({ aborted: 'AbortError', id: '00042', next: [{ id: '00042', label: 'Alice' }, { id: 'item_2', label: 'Alina' }], invalid: true });
});

test('optimistic save conflict preserves version until explicit validated reload/accept and successful retry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/apps/docs/.vitepress/theme/recipes/save.ts';
    const { createSaveSession } = await import(/* @vite-ignore */ path) as typeof import('../apps/docs/.vitepress/theme/recipes/save.js');
    const local: EditorDocument = { version: 1, children: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text: 'Local' }] }] };
    const remote: EditorDocument = { version: 1, children: [{ type: 'element', tag: 'p', attributes: {}, children: [{ type: 'text', text: 'Remote' }] }] };
    let server = 'v2';
    const expected: string[] = [];
    const session = createSaveSession({
      save: async (_document, version) => { expected.push(version); if (version !== server) throw new Error('VERSION_CONFLICT'); server = 'v3'; return server; },
      load: async () => ({ document: remote, version: server }),
    }, 'v1');
    let conflict = false;
    try { await session.save(local, { signal: new AbortController().signal }); } catch { conflict = true; }
    const afterConflict = session.getVersion();
    const loaded = await session.reload(new AbortController().signal);
    const beforeAccept = session.getVersion();
    window.editor.setJSON(loaded.document);
    session.acceptReload(loaded);
    await session.save(local, { signal: new AbortController().signal });
    return { conflict, afterConflict, beforeAccept, version: session.getVersion(), expected, remoteText: window.editor.surface.textContent };
  });
  expect(result).toEqual({ conflict: true, afterConflict: 'v1', beforeAccept: 'v1', version: 'v3', expected: ['v1', 'v2'], remoteText: 'Remote' });
});

test('save sessions reject stale reload identity, concurrent save and late aborted acceptance without advancing versions', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/apps/docs/.vitepress/theme/recipes/save.ts';
    const { createSaveSession } = await import(/* @vite-ignore */ path) as typeof import('../apps/docs/.vitepress/theme/recipes/save.js');
    const document: EditorDocument = { version: 1, children: [] };
    const releases: ((value: VersionedRecipeDocument) => void)[] = [];
    let releaseSave: (value: string) => void = () => {};
    const transportSave = new Promise<string>((resolve) => { releaseSave = resolve; });
    const session = createSaveSession({ save: async () => transportSave, load: async () => new Promise((resolve) => releases.push(resolve)) }, 'v1');
    const first = session.reload(new AbortController().signal).then(() => false, () => true);
    const second = session.reload(new AbortController().signal);
    releases[1]({ document, version: 'v3' });
    const current = await second;
    releases[0]({ document, version: 'v2' });
    const staleRejected = await first;
    let identityRejected = false;
    try { session.acceptReload({ ...current }); } catch { identityRejected = true; }
    session.acceptReload(current);
    const controller = new AbortController();
    const saving = session.save(document, { signal: controller.signal }).then(() => 'resolved', (error: unknown) => error instanceof DOMException ? error.name : 'other');
    let concurrent = false;
    try { await session.save(document, { signal: new AbortController().signal }); } catch { concurrent = true; }
    controller.abort();
    releaseSave('v4');
    const aborted = await saving;
    const versionAfterAbort = session.getVersion();
    await session.save(document, { signal: new AbortController().signal });
    return { staleRejected, identityRejected, concurrent, aborted, versionAfterAbort, finalVersion: session.getVersion() };
  });
  expect(result).toEqual({ staleRejected: true, identityRejected: true, concurrent: true, aborted: 'AbortError', versionAfterAbort: 'v3', finalVersion: 'v4' });
});

test('lazy highlighting caches one load, retries failed import and lets one cancelled request leave shared loading intact', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/apps/docs/.vitepress/theme/recipes/highlight.ts';
    const { createLazyHighlight } = await import(/* @vite-ignore */ path) as typeof import('../apps/docs/.vitepress/theme/recipes/highlight.js');
    let loads = 0;
    let release: (value: RecipeHighlightModule) => void = () => {};
    const loaded = new Promise<RecipeHighlightModule>((resolve) => { release = resolve; });
    const highlight = createLazyHighlight(async () => { loads++; if (loads === 1) throw new Error('Import failed'); return loaded; });
    let failed = false;
    try { await highlight({ source: 'const', language: 'typescript', signal: new AbortController().signal }); } catch { failed = true; }
    const controller = new AbortController();
    const cancelled = Promise.resolve(highlight({ source: 'const', language: 'typescript', signal: controller.signal })).then(() => 'resolved', (error: unknown) => error instanceof DOMException ? error.name : 'other');
    const active = highlight({ source: 'const', language: 'typescript', signal: new AbortController().signal });
    controller.abort();
    release({ highlight: ({ source }) => [{ from: 0, to: source.length, kind: 'keyword' }] });
    const [aborted, tokens] = await Promise.all([cancelled, active]);
    const cached = await highlight({ source: 'let', language: 'typescript', signal: new AbortController().signal });
    return { failed, loads, aborted, tokens, cached };
  });
  expect(result).toEqual({ failed: true, loads: 2, aborted: 'AbortError', tokens: [{ from: 0, to: 5, kind: 'keyword' }], cached: [{ from: 0, to: 3, kind: 'keyword' }] });
});

for (const kind of ['vue', 'react'] as const) test(`actual ${kind} recipe wrapper keeps atomic plugin state, controlled selection/history and cleanup${kind === 'react' ? ' under StrictMode' : ''}`, async ({ page }) => {
  await page.evaluate(async (kind) => {
    const path = '/tests/extension-recipes-adapters.fixture.tsx';
    const { mountRecipeAdapter } = await import(/* @vite-ignore */ path) as typeof import('./extension-recipes-adapters.fixture.js');
    await mountRecipeAdapter(kind);
  }, kind);
  const content = page.getByRole('textbox', { name: 'Recipe editor', exact: true });
  await expect(content).toHaveText('Recipe editor');
  if (kind === 'react') await expect.poll(() => page.evaluate(() => window.recipeAdapterProbe.instances.length)).toBeGreaterThanOrEqual(2);
  await page.evaluate(async () => {
    const path = '/apps/docs/.vitepress/theme/recipes/index.ts';
    const localPath = '/apps/docs/.vitepress/theme/recipes/local-services.ts';
    const { createRecipeBundle } = await import(/* @vite-ignore */ path) as typeof import('../apps/docs/.vitepress/theme/recipes/index.js');
    const { createLocalRecipeServices } = await import(/* @vite-ignore */ localPath) as typeof import('../apps/docs/.vitepress/theme/recipes/local-services.js');
    const editor = window.recipeAdapterProbe.editor!;
    editor.focus();
    const paragraph = editor.surface.querySelector('p')!;
    const range = document.createRange(); range.selectNodeContents(paragraph); range.collapse(false);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    const bundle = createRecipeBundle(createLocalRecipeServices().options);
    if (!bundle.insertRecord(editor, { id: 'record_42', label: 'Record' })) throw new Error('Expected supported recipe insertion.');
    window.recipeAdapterProbe.retained = editor.surface.querySelector<HTMLElement>('[data-record-id="record_42"]')!;
  });
  await expect(content.locator('[data-record-id="record_42"]')).toHaveAttribute('contenteditable', 'false');
  await page.keyboard.type('!');
  await expect(content).toHaveText('Recipe editorRecord!');
  expect(await page.evaluate(() => window.recipeAdapterProbe.retained === window.recipeAdapterProbe.editor!.surface.querySelector('[data-record-id="record_42"]'))).toBe(true);
  expect(await page.evaluate(async () => {
    const path = '/packages/plugins/dist/save-state.js';
    const { saveStateCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/save-state');
    const editor = window.recipeAdapterProbe.editor!;
    const saved = await saveStateCommands(editor).save();
    const source = editor.getHTML();
    editor.undo(); const typedUndone = editor.surface.textContent;
    editor.undo(); const nodeUndone = editor.surface.textContent;
    return { saved, sourceHasID: source.includes('data-record-id="record_42"'), typedUndone, nodeUndone };
  })).toEqual({ saved: true, sourceHasID: true, typedUndone: 'Recipe editorRecord', nodeUndone: 'Recipe editor' });
  expect(await page.evaluate(() => {
    const probe = window.recipeAdapterProbe;
    probe.unmount();
    return { removed: !document.querySelector('[data-recipe-adapter]'), allDisposed: probe.instances.every((editor) => { try { editor.getHTML(); return false; } catch { return true; } }) };
  })).toEqual({ removed: true, allDisposed: true });
});
