import { expect, test } from '@playwright/test';
import { setupCodeBlocks } from './code-blocks.fixture.js';

test.beforeEach(async ({ page }) => setupCodeBlocks(page));

test('code insertion splits the ordinary paragraph, preserves literal whitespace and roundtrips history/JSON', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, commands, viewHost } = window.codeBlockProbe;
    const source = '\tconst x = "<img src=x onerror=alert(1)>";\r\n\n  ';
    const inserted = commands.insert({ source, language: 'typescript' });
    const code = editor.surface.querySelector('pre')!;
    const html = editor.getHTML();
    const leaves = [...editor.surface.children].map((node) => [node.localName, node.textContent]);
    const sourceText = code.textContent;
    const selection = document.getSelection();
    const caret = selection?.anchorNode?.textContent;
    const inert = !editor.surface.querySelector('img,script') && !viewHost.querySelector('img,script');
    const json = editor.getJSON();
    editor.undo();
    const undone = editor.getHTML();
    editor.redo();
    const redone = editor.getHTML();
    editor.setJSON(json);
    return { inserted, leaves, sourceText, caret, inert, undone, redone, html, roundtrip: editor.getHTML() === html };
  });
  expect(result.inserted && result.inert && result.roundtrip).toBe(true);
  expect(result.leaves).toEqual([['p', 'A'], ['pre', '\tconst x = "<img src=x onerror=alert(1)>";\n\n  '], ['p', 'B']]);
  expect(result.caret).toBe(result.sourceText);
  expect(result.undone).toBe('<p>AB</p>');
  expect(result.redone).toBe(result.html);
});

test('commands validate language/limits and refuse structural selection, readonly and stale targets atomically', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, commands } = window.codeBlockProbe;
    let invalid = 0;
    for (const value of [{ source: 'x', language: 'javascript:alert(1)' }, { source: 'x'.repeat(20001) }]) {
      try { commands.insert(value); } catch { invalid++; }
    }
    const unchanged = editor.getHTML() === '<p>AB</p>' && !editor.canUndo();
    editor.setSelection(0, 2);
    const selected = commands.insert({ source: 'x' });
    editor.setSelection(1);
    commands.insert({ source: 'x', language: 'json' });
    const target = editor.surface.querySelector('pre')!;
    editor.setReadOnly(true);
    const readonly = [commands.insert({ source: 'y' }), commands.update(target, { source: 'y' }), commands.remove(target), commands.exit(target)];
    editor.setReadOnly(false);
    const html = editor.getHTML();
    editor.setHTML('<p>other</p>');
    editor.setHTML(html);
    const stale = commands.update(target, { source: 'stale' });
    return { invalid, unchanged, selected, readonly, stale };
  });
  expect(result).toEqual({ invalid: 2, unchanged: true, selected: false, readonly: [false, false, false, false], stale: false });
});

test('editing language/source, exiting and removing each participate in undo', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, commands } = window.codeBlockProbe;
    commands.insert({ source: 'one' });
    let node = editor.surface.querySelector('pre')!;
    const updated = commands.update(node, { source: 'two\n\t', language: 'javascript' });
    const value = commands.get(node);
    editor.undo();
    node = editor.surface.querySelector('pre')!;
    const restored = commands.get(node);
    const exited = commands.exit(node);
    const caretParent = document.getSelection()?.anchorNode;
    const next = node.nextElementSibling;
    const caretOutside = next?.localName === 'p' && !!caretParent && (caretParent === next || next.contains(caretParent));
    editor.undo();
    const removed = commands.remove(editor.surface.querySelector('pre')!);
    const count = editor.surface.querySelectorAll('pre').length;
    editor.undo();
    return { updated, value, restored, exited, caretOutside, removed, count, recovered: editor.surface.querySelector('pre')?.textContent };
  });
  expect(result).toEqual({ updated: true, value: { source: 'two\n\t', language: 'javascript' }, restored: { source: 'one', language: 'plaintext' }, exited: true, caretOutside: true, removed: true, count: 0, recovered: 'one' });
});

test('native code keyboard inserts LF/tab, protects outer boundaries and exits with Mod+Enter', async ({ page }) => {
  await page.evaluate(() => window.codeBlockProbe.commands.insert({ source: 'x' }));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('y');
  await expect(page.locator('.mw-content pre')).toHaveText('x\n\ty', { useInnerText: false });
  await page.evaluate(() => {
    const { editor } = window.codeBlockProbe;
    const node = editor.surface.querySelector('pre')!;
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
  });
  await page.keyboard.press('Backspace');
  await expect(page.locator('.mw-content pre')).toHaveText('x\n\ty', { useInnerText: false });
  await page.keyboard.press('ControlOrMeta+Enter');
  const outside = await page.evaluate(() => {
    const pre = window.codeBlockProbe.editor.surface.querySelector('pre')!;
    const selection = document.getSelection();
    return !!selection?.anchorNode && !!pre.nextElementSibling?.contains(selection.anchorNode);
  });
  expect(outside).toBe(true);
});

test('code paste takes literal plain text and keeps unsafe HTML inert', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, commands } = window.codeBlockProbe;
    commands.insert({ source: 'prefix:' });
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '<script>literal</script>\r\n\t');
    clipboardData.setData('text/html', '<img src=x onerror=alert(1)>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    // Firefox ignores ClipboardEventInit.clipboardData; explicitly install the fixture payload.
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    if (event.clipboardData?.getData('text/plain') !== '<script>literal</script>\r\n\t') throw new Error('Missing clipboard fixture payload.');
    editor.surface.dispatchEvent(event);
    const text = editor.surface.querySelector('pre')?.textContent;
    const inert = !editor.surface.querySelector('img,script');
    editor.undo();
    return { prevented: event.defaultPrevented, text, inert, undo: editor.surface.querySelector('pre')?.textContent };
  });
  expect(result).toEqual({ prevented: true, text: 'prefix:<script>literal</script>\n\t', inert: true, undo: 'prefix:' });
});

test('composition leaves code native ownership intact and rejects commands until composition ends', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, commands } = window.codeBlockProbe;
    commands.insert({ source: 'x' });
    const node = editor.surface.querySelector('pre')!;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const blocked = commands.update(node, { source: 'y' });
    const event = new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: '文', isComposing: true, bubbles: true, cancelable: true });
    editor.surface.dispatchEvent(event);
    const composingPrevented = event.defaultPrevented;
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { blocked, composingPrevented, source: node.textContent };
  });
  expect(result).toEqual({ blocked: false, composingPrevented: false, source: 'x' });
});

test('modal source is multiline, cancellation is observational, and external replacement closes stale drafts', async ({ page }) => {
  await page.evaluate(() => window.codeBlockProbe.form.open());
  const modal = page.getByRole('dialog', { name: 'Code block', exact: true });
  await expect(modal).toBeVisible();
  await modal.getByRole('textbox', { name: 'Code source', exact: true }).fill('const x = 1;\n\t');
  await modal.getByRole('combobox', { name: 'Code language' }).selectOption('typescript');
  await modal.getByRole('button', { name: 'Apply code', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.locator('.mw-content pre')).toHaveAttribute('data-language', 'typescript');
  const before = await page.evaluate(() => window.codeBlockProbe.editor.getHTML());
  await page.evaluate(() => window.codeBlockProbe.form.open(window.codeBlockProbe.editor.surface.querySelector('pre')!));
  await modal.getByRole('textbox', { name: 'Code source', exact: true }).fill('cancelled');
  await modal.getByRole('button', { name: 'Close code editor', exact: true }).click();
  expect(await page.evaluate(() => window.codeBlockProbe.editor.getHTML())).toBe(before);
  await page.evaluate(() => {
    const { editor, form } = window.codeBlockProbe;
    form.open(editor.surface.querySelector('pre')!);
    editor.setHTML('<p>replacement</p>');
  });
  await expect(modal).not.toBeVisible();
  await expect(page.locator('.mw-content')).toHaveText('replacement');
});

test('focus-time replacement cannot redirect modal apply', async ({ page }) => {
  await page.evaluate(() => {
    const { editor, form } = window.codeBlockProbe;
    form.open();
    form.setValue({ source: 'stale' });
    editor.surface.addEventListener('focus', () => editor.setHTML('<p>newer document</p>'), { once: true });
  });
  await page.getByRole('button', { name: 'Apply code', exact: true }).click();
  await expect(page.locator('.mw-content')).toHaveText('newer document');
  await expect(page.locator('.mw-content pre')).toHaveCount(0);
});

test('copy failure is reported without changing source or history', async ({ page }) => {
  await page.evaluate(() => {
    const { form } = window.codeBlockProbe;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
    form.open();
    form.setValue({ source: 'copy me' });
  });
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Code could not be copied.' })).toBeVisible();
  expect(await page.evaluate(() => ({ html: window.codeBlockProbe.editor.getHTML(), undo: window.codeBlockProbe.editor.canUndo() }))).toEqual({ html: '<p>AB</p>', undo: false });
});

test('async highlighting ignores late results, rejects unsafe tokens and cleans only owned views', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { editor, commands, view, viewHost } = window.codeBlockProbe;
    view.destroy();
    commands.insert({ source: 'old' });
    const path = '/packages/plugins/dist/ui/code-blocks.js';
    const { createCodeBlockView } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/code-blocks');
    const pending: { source: string; signal: AbortSignal; resolve: (tokens: readonly { from: number; to: number; kind: 'keyword' }[]) => void }[] = [];
    const controller = createCodeBlockView(viewHost, editor, { highlight: ({ source, signal }) => new Promise((resolve) => pending.push({ source, signal, resolve })) });
    await Promise.resolve();
    const old = pending[0];
    commands.update(editor.surface.querySelector('pre')!, { source: 'new' });
    await Promise.resolve();
    const next = pending[1];
    old.resolve([{ from: 0, to: 3, kind: 'keyword' }]);
    next.resolve([{ from: 0, to: 3, kind: 'keyword' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const highlighted = viewHost.querySelector('.mw-code-token-keyword')?.textContent;
    const unchangedDocument = !editor.surface.querySelector('.mw-code-token-keyword');
    controller.destroy();
    const sentinel = document.createElement('p');
    sentinel.textContent = 'application';
    viewHost.append(sentinel);
    const invalid = createCodeBlockView(viewHost, editor, { highlight: () => [{ from: 0, to: 20001, kind: 'keyword' }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const literal = viewHost.querySelector('code')?.textContent;
    const error = !!viewHost.querySelector('[data-highlight-error]');
    invalid.destroy();
    invalid.destroy();
    return { aborted: old.signal.aborted, highlighted, unchangedDocument, literal, error, remaining: viewHost.textContent };
  });
  expect(result).toEqual({ aborted: true, highlighted: 'new', unchangedDocument: true, literal: 'new', error: true, remaining: 'application' });
});

test('language policies and commands are per editor, and outstanding views abort on destruction', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const behaviorPath = '/packages/plugins/dist/code-blocks.js';
    const uiPath = '/packages/plugins/dist/ui/code-blocks.js';
    const { codeBlocks, codeBlockCommands } = await import(/* @vite-ignore */ behaviorPath) as typeof import('@morfira-dev/wysiwyg/plugins/code-blocks');
    const { createCodeBlockView } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/code-blocks');
    const { editor, commands, viewHost, view } = window.codeBlockProbe;
    view.destroy();
    const otherHost = document.createElement('section');
    document.body.append(otherHost);
    const other = window.createEditor(otherHost, { value: '<p>Other</p>', plugins: [codeBlocks({ languages: ['sql'] })] });
    const otherCommands = codeBlockCommands(other);
    editor.setSelection(1);
    commands.insert({ source: 'old' });
    const foreign = otherCommands.get(editor.surface.querySelector('pre')!);
    other.setSelection(0);
    otherCommands.insert({ source: 'SELECT 1', language: 'sql' });
    const current = other.getHTML();
    let invalidPolicy = false;
    try { codeBlocks({ languages: ['SQL'] }); } catch { invalidPolicy = true; }
    let signal: AbortSignal | undefined;
    let resolve: ((tokens: readonly []) => void) | undefined;
    const waiting = createCodeBlockView(viewHost, editor, { highlight: (request) => {
      signal = request.signal;
      return new Promise((done) => { resolve = done; });
    } });
    await Promise.resolve();
    const ownViews = [...viewHost.querySelectorAll('.mw-code-view')];
    waiting.destroy();
    resolve?.([]);
    await new Promise((done) => setTimeout(done, 0));
    const noResurrection = ownViews.every((node) => !node.isConnected);
    const isolated = other.getHTML() === current;
    other.destroy();
    return { languages: [...otherCommands.languages], foreign: foreign === undefined, invalidPolicy, aborted: signal?.aborted, noResurrection, isolated };
  });
  expect(result).toEqual({ languages: ['plaintext', 'sql'], foreign: true, invalidPolicy: true, aborted: true, noResurrection: true, isolated: true });
});

test('confirmed composition cancellation through replacement/readonly re-enables commands and the form', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, commands, form } = window.codeBlockProbe;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.setHTML('<p>replacement</p>');
    editor.setSelection(2);
    const inserted = commands.insert({ source: 'after replacement' });
    form.open(editor.surface.querySelector('pre')!);
    const reopened = form.isOpen();
    form.close();
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.setReadOnly(true);
    editor.setReadOnly(false);
    const updated = commands.update(editor.surface.querySelector('pre')!, { source: 'after readonly' });
    return { inserted, reopened, updated, source: editor.surface.querySelector('pre')?.textContent };
  });
  expect(result).toEqual({ inserted: true, reopened: true, updated: true, source: 'after readonly' });
});

test('reparented UI hosts cannot accept late highlight results or apply modal drafts into the document', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { editor, commands, form, view, viewHost, uiHost } = window.codeBlockProbe;
    view.destroy();
    commands.insert({ source: 'safe' });
    const path = '/packages/plugins/dist/ui/code-blocks.js';
    const { createCodeBlockView } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/code-blocks');
    let complete: ((tokens: readonly { from: number; to: number; kind: 'keyword' }[]) => void) | undefined;
    let signal: AbortSignal | undefined;
    const pending = createCodeBlockView(viewHost, editor, { highlight: (request) => {
      signal = request.signal;
      return new Promise((resolve) => { complete = resolve; });
    } });
    await Promise.resolve();
    editor.surface.append(viewHost);
    complete?.([{ from: 0, to: 4, kind: 'keyword' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const removedView = viewHost.querySelectorAll('.mw-code-view').length === 0;
    const noTokens = editor.surface.querySelectorAll('.mw-code-token-keyword').length === 0;
    document.body.append(viewHost);
    pending.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    form.open(editor.surface.querySelector('pre')!);
    const formOpened = form.isOpen();
    form.setValue({ source: 'must not apply' });
    const apply = [...form.element.querySelectorAll('button')].find((button) => button.textContent === 'Apply code')!;
    editor.surface.append(uiHost);
    apply.click();
    const noModal = uiHost.querySelectorAll('dialog').length === 0;
    const source = editor.surface.querySelector('pre')?.textContent;
    return { aborted: signal?.aborted, removedView, noTokens, noModal, source, formOpened };
  });
  expect(result).toEqual({ aborted: true, removedView: true, noTokens: true, noModal: true, source: 'safe', formOpened: true });
});
