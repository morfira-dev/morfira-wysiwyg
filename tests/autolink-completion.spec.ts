import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EditorPlugin } from '@morfira-dev/wysiwyg';

const url = 'https://example.com/path';
const initialize = async (page: Page, html: string, mode: 'normal' | 'checklists' | 'consumers' = 'normal') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ html, mode }) => {
    const autolinkPath = '/packages/plugins/dist/autolink.js';
    const { autolink } = await import(/* @vite-ignore */ autolinkPath) as typeof import('@morfira-dev/wysiwyg/plugins/autolink');
    const plugins: EditorPlugin[] = [autolink()];
    if (mode === 'checklists') {
      const checklistPath = '/packages/plugins/dist/checklists.js';
      const { checklists } = await import(/* @vite-ignore */ checklistPath) as typeof import('@morfira-dev/wysiwyg/plugins/checklists');
      plugins.push(checklists());
    }
    if (mode === 'consumers') {
      plugins.push(window.createMarkdownShortcuts(), window.createSlash({ debounceMs: 0, provide: () => [{ id: 'snippet', label: 'URL', text: 'https://example.com/path' }] }));
    }
    window.dispose();
    const host = document.createElement('div');
    host.className = 'autolink-completion';
    document.body.append(host);
    window.editor = window.createEditor(host, { value: html, plugins, schema: [
      { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } },
    ] });
    window.changes = [];
    window.editor.subscribe((change) => window.changes.push(change));
    window.editor.setSelection(window.editor.surface.textContent!.length);
  }, { html, mode });
};
const surface = (page: Page) => page.locator('.autolink-completion .mw-content');
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const paste = (page: Page, text: string, html = '') => page.evaluate(({ text, html }) => {
  const clipboard = new DataTransfer();
  clipboard.setData('text/plain', text);
  if (html) clipboard.setData('text/html', html);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboard });
  window.editor.surface.dispatchEvent(event);
}, { text, html });

// Each scenario exercises a distinct operation boundary; existing Space tests
// retain the URL corpus rather than multiplying it across completion routes.
test('root Enter links rich URL but keeps the actual new paragraph caret and two history operations', async ({ page }) => {
  const before = '<p>Go <strong>https://example.</strong><em>com/path</em>.</p>';
  await initialize(page, before);
  await page.keyboard.press('Enter');
  await expect(surface(page).locator('a')).toHaveText(url);
  await expect(surface(page).locator('a strong')).toHaveText('https://example.');
  await expect(surface(page).locator('a em')).toHaveText('com/path');
  expect(await page.evaluate(() => ({ inNewBlock: document.getSelection()!.anchorNode === window.editor.surface.lastElementChild, offset: document.getSelection()!.anchorOffset, changes: window.changes.length }))).toEqual({ inNewBlock: true, offset: 0, changes: 2 });
  const linked = await html(page);
  await page.evaluate(() => window.editor.undo());
  await expect(surface(page).locator('a')).toHaveCount(0);
  await expect(surface(page).locator(':scope > p')).toHaveCount(2);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  await page.evaluate(() => { window.editor.redo(); window.editor.redo(); });
  expect(await html(page)).toBe(linked);
  await page.keyboard.type('X');
  await expect(surface(page).locator('p').last()).toHaveText('X');
  await expect(surface(page).locator('a')).toHaveText(url);
});

test('plain list keydown completion links only the source item and types in its new sibling', async ({ page }) => {
  await initialize(page, `<ul><li>${url}</li></ul>`);
  await page.keyboard.press('Enter');
  await expect(surface(page).locator(':scope > ul > li')).toHaveCount(2);
  await expect(surface(page).locator('li').first().locator('a')).toHaveText(url);
  expect(await page.evaluate(() => ({ point: document.getSelection()!.anchorNode === window.editor.surface.querySelector('li:last-child'), offset: document.getSelection()!.anchorOffset }))).toEqual({ point: true, offset: 0 });
  await page.keyboard.type('X');
  await expect(surface(page).locator('li').last()).toHaveText('X');
  await expect(surface(page).locator('a')).toHaveText(url);
});

test('wrapped checklist Enter preserves source state and branches while unchecked sibling owns the caret', async ({ page }) => {
  await initialize(page, `<ul><li data-checklist-checked="true"><p title="Body">${url}</p><h2>Later</h2><ul><li>Child</li></ul></li></ul>`, 'checklists');
  await page.evaluate(() => {
    const body = window.editor.surface.querySelector('[title="Body"]')!;
    const node = body.firstChild!;
    document.getSelection()!.setBaseAndExtent(node, node.textContent!.length, node, node.textContent!.length);
  });
  await page.keyboard.press('Enter');
  await expect(surface(page).locator(':scope > ul > li').first()).toHaveAttribute('data-checklist-checked', 'true');
  await expect(surface(page).locator(':scope > ul > li').nth(1)).toHaveAttribute('data-checklist-checked', 'false');
  await expect(surface(page).locator('a')).toHaveText(url);
  await expect(surface(page).locator('h2')).toHaveText('Later');
  await expect(surface(page).locator('li > ul > li')).toHaveText('Child');
  await page.keyboard.type('X');
  await expect(surface(page).locator(':scope > ul > li').nth(1).locator('p')).toHaveText('X');
  expect(await page.evaluate(() => window.changes.length)).toBe(3);
});

test('single plain URL paste retains core formatting affinity, neighboring text and two-operation history outside the anchor', async ({ page }) => {
  await initialize(page, '<p>AB</p>');
  await page.evaluate(async () => {
    const path = '/packages/plugins/dist/autolink.js';
    const { autolinkCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/autolink');
    window.editor.setSelection(1);
    window.editor.format('bold', true);
    autolinkCommands(window.editor).setEnabled(false);
  });
  await paste(page, `${url}.`);
  const coreFormats = await page.evaluate(() => window.editor.getFormats());
  await expect(surface(page).locator('a')).toHaveCount(0);
  expect(coreFormats.bold).toBeUndefined();
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: url.length + 2, length: 0 });
  const baseline = await page.evaluate(async () => {
    window.editor.undo();
    const originalBold = window.editor.getFormats().bold;
    const originalSelection = window.editor.getSelection();
    window.editor.redo();
    const redoSelection = window.editor.getSelection();
    window.editor.undo();
    const path = '/packages/plugins/dist/autolink.js';
    const { autolinkCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/autolink');
    autolinkCommands(window.editor).setEnabled(true);
    window.changes = [];
    const formats: ReturnType<typeof window.editor.getFormats>[] = [];
    window.editor.providePlugin('post-core-formats', formats);
    window.editor.subscribe((change) => { if (change.source === 'user') formats.push(window.editor.getFormats()); });
    return { originalBold, originalSelection, redoSelection };
  });
  expect(baseline).toEqual({ originalBold: true, originalSelection: { index: 1, length: 0 }, redoSelection: { index: url.length + 2, length: 0 } });
  expect(await page.evaluate(() => window.editor.getFormats().bold)).toBe(true);
  await paste(page, `${url}.`);
  await expect(surface(page).locator('a')).toHaveText(url);
  await expect(surface(page)).toHaveText(`A${url}.B`);
  expect(await page.evaluate(() => ({ changes: window.changes.length, insideLink: !!document.getSelection()!.anchorNode?.parentElement?.closest('a') }))).toEqual({ changes: 2, insideLink: false });
  expect(await page.evaluate(() => window.editor.getPlugin<ReturnType<typeof window.editor.getFormats>[]>('post-core-formats')![0])).toEqual(coreFormats);
  expect(await page.evaluate(() => window.editor.getFormats())).toEqual(coreFormats);
  const linked = await html(page);
  await page.evaluate(() => window.editor.undo());
  await expect(surface(page).locator('a')).toHaveCount(0);
  await expect(surface(page)).toHaveText(`A${url}.B`);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: url.length + 2, length: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>AB</p>');
  expect(await page.evaluate(() => window.editor.getFormats().bold)).toBe(true);
  await page.evaluate(() => { window.editor.redo(); window.editor.redo(); });
  expect(await html(page)).toBe(linked);
  expect(await page.evaluate(() => window.editor.getFormats())).toEqual(coreFormats);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: url.length + 2, length: 0 });
  await page.keyboard.type('X');
  await expect(surface(page).locator('a')).toHaveText(url);
  await expect(surface(page).locator('strong')).toHaveCount(0);
  await expect(surface(page)).toHaveText(`A${url}.XB`);
});


test('bare URL paste at an empty block end preserves terminal caret across history and types outside its anchor', async ({ page }) => {
  await initialize(page, '<p><br></p>');
  await paste(page, url);
  await expect(surface(page).locator('a')).toHaveText(url);
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), inside: !!document.getSelection()!.anchorNode?.parentElement?.closest('a') }))).toEqual({ selection: { index: url.length, length: 0 }, inside: false });
  const linked = await html(page);
  await page.evaluate(() => window.editor.undo());
  await expect(surface(page).locator('a')).toHaveCount(0);
  await expect(surface(page)).toHaveText(url);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: url.length, length: 0 });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p><br></p>');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 0 });
  await page.evaluate(() => { window.editor.redo(); window.editor.redo(); });
  expect(await html(page)).toBe(linked);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: url.length, length: 0 });
  await page.keyboard.type('X');
  await expect(surface(page).locator('a')).toHaveText(url);
  await expect(surface(page)).toHaveText(`${url}X`);
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), inside: !!document.getSelection()!.anchorNode?.parentElement?.closest('a') }))).toEqual({ selection: { index: url.length + 1, length: 0 }, inside: false });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(linked);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: url.length, length: 0 });
});

test('HTML, multiline, whitespace, selected paste and API input remain literal', async ({ page }) => {
  await initialize(page, '<p><br></p>');
  for (const [text, representation] of [[url, `<p>${url}</p>`], [`${url}\nnext`, ''], [` ${url}`, ''], [`${url} `, ''], ['https://example.com/path\u0001tail', '']]) {
    await page.evaluate(() => { window.editor.setHTML('<p><br></p>'); window.editor.setSelection(0); });
    await paste(page, text, representation);
    await expect(surface(page).locator('a')).toHaveCount(0);
    expect(await html(page)).not.toContain('<a');
  }
  await page.evaluate(() => { window.editor.setHTML('<p>Replace</p>'); window.editor.setSelection(0, 7); });
  await paste(page, url);
  await expect(surface(page).locator('a')).toHaveCount(0);
  await page.evaluate((url) => {
    window.editor.setHTML(`<p>${url}</p>`);
    window.editor.setJSON(window.editor.getJSON());
    window.editor.setSelection(url.length);
    window.editor.insertHTML(url);
  }, url);
  await expect(surface(page).locator('a')).toHaveCount(0);
  await page.keyboard.press('Shift+Enter');
  await expect(surface(page).locator('a')).toHaveCount(0);
});

test('code, existing links, semantic inline nodes and unsafe or oversized tokens stay excluded', async ({ page }) => {
  await initialize(page, '<p><br></p>');
  for (const source of [`<pre>${url}</pre>`, `<p><code>${url}</code></p>`, `<p><span data-mw-node="test:reference" data-id="42">${url}</span></p>`, '<p>javascript:alert(1)</p>', '<p>https://example.com/path\u007ftail</p>', `<p>https://example.com/${'x'.repeat(2048)}</p>`]) {
    await page.evaluate((value) => { window.editor.setHTML(value); window.editor.setSelection(window.editor.surface.textContent!.length); }, source);
    await page.keyboard.press('Enter');
    await expect(surface(page).locator('a')).toHaveCount(0);
    expect(await html(page)).not.toContain('<a');
  }
  await page.evaluate((url) => { window.editor.setHTML(`<p><a href="${url}">${url}</a></p>`); window.editor.setSelection(url.length); }, url);
  await page.keyboard.press('Enter');
  await expect(surface(page).locator('a a')).toHaveCount(0);
});

test('read-only, composition and canceled completion events cannot create links', async ({ page }) => {
  await initialize(page, `<p>${url}</p>`);
  const before = await html(page);
  await page.evaluate(() => {
    const editor = window.editor;
    editor.setReadOnly(true);
    editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true }));
    editor.setReadOnly(false);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', isComposing: true, bubbles: true, cancelable: true }));
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const canceled = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
    canceled.preventDefault(); editor.surface.dispatchEvent(canceled);
    const data = new DataTransfer(); data.setData('text/plain', 'https://example.org');
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: data });
    paste.preventDefault(); editor.surface.dispatchEvent(paste);
  });
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ changes: 0, undo: false });
  await page.evaluate((url) => {
    const editor = window.editor;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.setHTML(`<p>External ${url}</p>`);
    editor.setSelection(editor.surface.textContent!.length);
  }, url);
  await page.keyboard.press('Enter');
  await expect(surface(page).locator('a')).toHaveText(url);
  await page.evaluate((url) => {
    const editor = window.editor;
    editor.setHTML(`<p>${url}</p>`);
    editor.setSelection(url.length);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.setReadOnly(true);
    editor.setReadOnly(false);
    editor.setSelection(url.length);
  }, url);
  await page.keyboard.press('Space');
  await expect(surface(page).locator('a')).toHaveText(url);
});

test('Markdown and slash consumers do not fabricate Enter URL completion', async ({ page }) => {
  await initialize(page, '<p>---</p>', 'consumers');
  await page.keyboard.press('Enter');
  await expect(surface(page).locator('hr')).toHaveCount(1);
  await expect(surface(page).locator('a')).toHaveCount(0);
  await page.evaluate(() => { window.editor.setHTML('<p>/cmd</p>'); window.editor.setSelection(4); window.slashCommands(window.editor).open(); });
  await expect.poll(() => page.evaluate(() => window.slashCommands(window.editor).getState().status)).toBe('ready');
  await page.keyboard.press('Enter');
  await expect(surface(page)).toHaveText(url);
  await expect(surface(page).locator('a')).toHaveCount(0);
});

test('application selection movement or pending-format changes invalidate automatic follow-up', async ({ page }) => {
  await initialize(page, `<p>${url}</p><p>Keep</p>`);
  for (const effect of ['selection', 'format'] as const) {
    await page.evaluate(({ url, effect }) => {
      const editor = window.editor;
      editor.setHTML(`<p>${url}</p><p>Keep</p>`); editor.setSelection(url.length); window.changes = [];
      const stop = editor.subscribe((change) => {
        if (change.source !== 'user') return;
        stop();
        if (effect === 'selection') editor.setSelection(0);
        else editor.format('bold', true);
      });
    }, { url, effect });
    await page.keyboard.press('Enter');
    await expect(surface(page).locator('a')).toHaveCount(0);
    expect(await page.evaluate(() => window.changes.length)).toBe(1);
    if (effect === 'selection') expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 0 });
    else {
      expect(await page.evaluate(() => window.editor.getFormats().bold)).toBe(true);
      await page.keyboard.type('X');
      await expect(surface(page).locator('strong')).toHaveText('X');
    }
  }
});

test('external value replacement in an input observer cannot resurrect the prepared URL or old caret', async ({ page }) => {
  await initialize(page, `<p>${url}</p>`);
  await page.evaluate(() => {
    const stop = window.editor.subscribe((change) => {
      if (change.source !== 'user') return;
      stop(); window.editor.setHTML('<p>External</p>'); window.editor.setSelection(3);
    });
  });
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<p>External</p>');
  expect(await page.evaluate(() => ({ selection: window.editor.getSelection(), undo: window.editor.canUndo() }))).toEqual({ selection: { index: 3, length: 0 }, undo: false });
});

test('completion is local and destroyed-editor captures cannot affect a new instance', async ({ page }) => {
  await initialize(page, `<p>${url}</p>`);
  const requests: string[] = [];
  await page.route('https://example.com/**', (route) => { requests.push(route.request().url()); return route.abort(); });
  await page.keyboard.press('Enter');
  await expect(surface(page).locator('a')).toHaveText(url);
  await page.evaluate(() => window.editor.destroy());
  await initialize(page, '<p><br></p>');
  await paste(page, url);
  await expect(surface(page).locator('a')).toHaveText(url);
  expect(requests).toEqual([]);
});
