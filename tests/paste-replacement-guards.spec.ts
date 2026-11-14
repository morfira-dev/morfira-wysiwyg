import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const original = '<p>Alpha <strong>one</strong></p><h2><em>Beta</em> tail</h2><p>Keep</p>';
const reference: SchemaNodeSpec = { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } };

const initialize = async (page: Page, html = original, schema: SchemaNodeSpec[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ html, schema }) => {
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value: html, schema, onChange: (change) => window.changes.push(change) });
    window.dispose = () => window.editor.destroy();
  }, { html, schema });
};

const selectBackwards = async (page: Page) => {
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('h2 em')!.firstChild!, 2, root.querySelector('p')!.firstChild!, 6);
  });
};

const paste = async (page: Page, input: { html?: string; text?: string }) => page.evaluate((input) => {
  const data = new DataTransfer();
  if (input.html !== undefined) data.setData('text/html', input.html);
  if (input.text !== undefined) data.setData('text/plain', input.text);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, input);

test('paste prefers HTML over plain text and restores the exact backward range in one undo', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  const keep = await page.locator('.mw-content > p').last().elementHandle();
  expect(await paste(page, { html: '<u>HTML</u>', text: 'Wrong\ntext' })).toBe(true);
  const replaced = '<p>Alpha <u>HTML</u><em>ta</em> tail</p><p>Keep</p>';
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ html: replaced, selection: { index: 10, length: 0 }, changes: 1 });
  expect(await keep!.evaluate((element) => element.isConnected && element === window.editor.surface.lastElementChild)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => {
    const s = document.getSelection()!;
    return { anchor: s.anchorNode?.textContent, anchorOffset: s.anchorOffset, focus: s.focusNode?.textContent, focusOffset: s.focusOffset, undo: window.editor.canUndo() };
  })).toEqual({ anchor: 'Beta', anchorOffset: 2, focus: 'Alpha ', focusOffset: 6, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 10, length: 0 });
});

test('plain clipboard text stays literal and normalizes CRLF lone CR and LF into line breaks', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  await paste(page, { text: '<b>X</b>\r\nY\rZ\n' });
  const replaced = '<p>Alpha &lt;b&gt;X&lt;/b&gt;<br>Y<br>Z<br><em>ta</em> tail</p><p>Keep</p>';
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  await expect(page.locator('.mw-content b')).toHaveCount(0);
  await expect(page.locator('.mw-content br')).toHaveCount(3);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const paragraph = root.firstElementChild!;
    const selection = document.getSelection()!;
    return {
      parentIsParagraph: selection.anchorNode === paragraph,
      previousIsBreak: paragraph.childNodes[selection.anchorOffset - 1] instanceof HTMLBRElement,
      nextIsSuffix: paragraph.childNodes[selection.anchorOffset] === paragraph.querySelector('em'),
      caret: window.editor.getSelection(),
    };
  })).toEqual({ parentIsParagraph: true, previousIsBreak: true, nextIsSuffix: true, caret: { index: 16, length: 0 } });
  await page.keyboard.insertText('!');
  // After a br, native input may inherit the following em. Paste guarantees
  // the exact insertion position, without a new forced native typing state.
  expect(await page.evaluate(() => ({ text: window.editor.surface.textContent, caret: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ text: 'Alpha <b>X</b>YZ!ta tailKeep', caret: { index: 17, length: 0 }, changes: 2 });
  await expect(page.locator('.mw-content br')).toHaveCount(3);
  await expect(page.locator('.mw-content em')).toHaveText(/^!?ta$/);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(replaced);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('unsafe markup and foreign namespaces never enter the live replacement surface', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
    window.editor.insertHTML('<strong onclick="window.bad=true">Safe</strong><a href="javascript:alert(1)">link</a><img src="javascript:alert(1)" onerror="window.bad=true"><svg><script>window.bad=true</script></svg><math><mi>Foreign</mi></math><script>window.bad=true</script><span style="position: fixed; color: red" onmouseover="window.bad=true">R</span>');
    const forbidden = 'script,svg,math,[onclick],[onerror],[onmouseover],[href^="javascript:"],[src^="javascript:"]';
    const records = observer.takeRecords();
    observer.disconnect();
    const unsafeAdded = records.some((record) => [...record.addedNodes].some((node) => node instanceof Element && (node.matches(forbidden) || node.querySelector(forbidden))));
    const unsafeRemovedAttribute = records.some((record) => record.type === 'attributes' && (/^on/i.test(record.attributeName ?? '') || /javascript:|position\s*:/i.test(record.oldValue ?? '')));
    return { html: window.editor.getHTML(), unsafeAdded, unsafeRemovedAttribute, bad: Reflect.get(window, 'bad'), changes: window.changes.length };
  });
  expect(result).toEqual({ html: '<p>Alpha <strong>Safe</strong><a>link</a><span style="color: red">R</span><em>ta</em> tail</p><p>Keep</p>', unsafeAdded: false, unsafeRemovedAttribute: false, bad: undefined, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('a fully stripped HTML clipboard fragment is a no-op and does not fall back to plain text', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  const before = await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }));
  const first = await page.locator('.mw-content > p').first().elementHandle();
  expect(await paste(page, { html: '<script>bad()</script><svg><text>foreign</text></svg><math><mi>x</mi></math>', text: 'Do not insert' })).toBe(true);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ ...before, changes: 0, undo: false });
  expect(await first!.evaluate((element) => element === window.editor.surface.firstElementChild && element.isConnected)).toBe(true);
});

test('invalid outer schema import throws before any live mutation and retains existing history and DOM identity', async ({ page }) => {
  await initialize(page, original, [reference]);
  await page.evaluate(() => window.editor.transact((root) => root.lastElementChild!.append(document.createTextNode('!'))));
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const before = { html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length };
    const first = editor.surface.firstElementChild;
    const keep = editor.surface.lastElementChild;
    const observer = new MutationObserver(() => {});
    observer.observe(editor.surface, { childList: true, subtree: true, attributes: true });
    let rejected = false;
    try { editor.insertHTML('<span data-mw-node="test:reference">Missing id</span>'); }
    catch (error) { rejected = error instanceof TypeError; }
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { before, rejected, mutations, after: { html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length }, sameFirst: first === editor.surface.firstElementChild, sameKeep: keep === editor.surface.lastElementChild, undo: editor.canUndo(), redo: editor.canRedo() };
  });
  expect(result).toEqual({ before: { html: original.replace('Keep', 'Keep!'), selection: { index: 6, length: 5 }, changes: 1 }, rejected: true, mutations: 0, after: result.before, sameFirst: true, sameKeep: true, undo: true, redo: false });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('invalid schema clipboard HTML is ignored atomically without an uncaught event error', async ({ page }) => {
  await initialize(page, original, [reference]);
  await selectBackwards(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const first = await page.locator('.mw-content > p').first().elementHandle();
  await paste(page, { html: '<p data-mw-node="test:reference" data-id="wrong-tag">Wrong wrapper</p>', text: 'Do not fall back' });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: original, selection: { index: 6, length: 5 }, changes: 0, undo: false });
  expect(await first!.evaluate((element) => element === window.editor.surface.firstElementChild && element.isConnected)).toBe(true);
  expect(errors).toEqual([]);
});

test('caught invalid nested insertHTML still poisons its outer transaction and restores document range and history', async ({ page }) => {
  await initialize(page, original, [reference]);
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    let nestedCaught = false;
    let outerRejected = false;
    try {
      editor.transact((root) => {
        root.lastElementChild!.append(document.createTextNode('Partial'));
        try { editor.insertHTML('<span data-mw-node="test:reference">Invalid</span>'); }
        catch { nestedCaught = true; }
        root.lastElementChild!.append(document.createTextNode('Still partial'));
      });
    }
    catch { outerRejected = true; }
    return { nestedCaught, outerRejected, html: editor.getHTML(), selection: editor.getSelection(), changes: window.changes.length, undo: editor.canUndo(), redo: editor.canRedo() };
  });
  expect(result).toEqual({ nestedCaught: true, outerRejected: true, html: original, selection: { index: 6, length: 5 }, changes: 0, undo: false, redo: false });
  expect(await page.evaluate(() => ({ anchor: document.getSelection()!.anchorNode?.textContent, offset: document.getSelection()!.anchorOffset }))).toEqual({ anchor: 'Beta', offset: 2 });
});

test('a post-commit observer error is not swallowed as an invalid import or rolled back', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const off = editor.events.on('change', () => { throw new Error('Observer failed after commit'); });
    let rejected = false;
    try { editor.insertHTML('<u>X</u>'); }
    catch (error) { rejected = error instanceof AggregateError; }
    off();
    return { rejected, html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), changes: window.changes.length };
  });
  expect(result).toEqual({ rejected: true, html: '<p>Alpha <u>X</u><em>ta</em> tail</p><p>Keep</p>', selection: { index: 7, length: 0 }, undo: true, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('clipboard validation handling does not swallow a post-commit observer failure', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const editor = window.editor;
    const errors: boolean[] = [];
    const record = (event: ErrorEvent) => {
      errors.push(event.error instanceof AggregateError);
      // The test observes the surfaced listener exception without logging an
      // expected uncaught browser error. Core must not suppress that exception.
      event.preventDefault();
    };
    window.addEventListener('error', record);
    const off = editor.events.on('change', () => { throw new Error('Clipboard observer failed after commit'); });
    const data = new DataTransfer();
    data.setData('text/html', '<u>X</u>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    editor.surface.dispatchEvent(event);
    off();
    window.removeEventListener('error', record);
    return { errors, html: editor.getHTML(), changes: window.changes.length, undo: editor.canUndo(), prevented: event.defaultPrevented };
  });
  expect(result).toEqual({ errors: [true], html: '<p>Alpha <u>X</u><em>ta</em> tail</p><p>Keep</p>', changes: 1, undo: true, prevented: true });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('a canceled clipboard event leaves the selection intact and ordinary paste resumes afterward', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  await page.evaluate(() => {
    const root = window.editor.surface;
    const cancel = (event: Event) => event.preventDefault();
    root.addEventListener('paste', cancel, { capture: true, once: true });
  });
  await paste(page, { html: '<u>X</u>', text: 'Wrong' });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ html: original, selection: { index: 6, length: 5 }, undo: false, changes: 0 });
  await paste(page, { html: '<u>X</u>' });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>Alpha <u>X</u><em>ta</em> tail</p><p>Keep</p>');
});

for (const mode of ['read-only', 'composition'] as const) test(`${mode} blocks clipboard replacement while external synchronization remains authoritative`, async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  await page.evaluate((mode) => {
    if (mode === 'read-only') window.editor.setReadOnly(true);
    else window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  }, mode);
  await paste(page, { html: '<u>X</u>', text: 'Wrong' });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: original, selection: { index: 6, length: 5 }, changes: 0, undo: false });
  const synchronized = await page.evaluate((mode) => {
    window.editor.setHTML('<p>New</p><h2><em>Body</em></h2><p>Stay</p>');
    if (mode === 'read-only') window.editor.setReadOnly(false);
    else window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('h2 em')!.firstChild!, 2, root.querySelector('p')!.firstChild!, 1);
    return { changes: window.changes.length, source: window.changes.at(-1)?.source };
  }, mode);
  expect(synchronized).toEqual({ changes: 1, source: 'api' });
  await paste(page, { html: '<u>Y</u>' });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, source: window.changes.at(-1)?.source }))).toEqual({ html: '<p>N<u>Y</u><em>dy</em></p><p>Stay</p>', selection: { index: 2, length: 0 }, changes: synchronized.changes + 1, source: 'user' });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>New</p><h2><em>Body</em></h2><p>Stay</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('rich clipboard replacement in one merged cell preserves semantic suffix metadata and every other cell', async ({ page }) => {
  const html = '<table><tbody><tr><td rowspan="2" colspan="2"><p>Alpha <strong>one</strong></p><h2><span data-mw-node="test:reference" data-id="retained">Beta</span> tail</h2></td><td><p>A</p></td></tr><tr><td><p>B</p></td></tr></tbody></table><p>Keep</p>';
  await initialize(page, html, [reference]);
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('h2 span')!.firstChild!, 2, root.querySelector('td p')!.firstChild!, 6);
  });
  const cell = page.locator('.mw-content td[rowspan]');
  const neighbor = await page.locator('.mw-content td').nth(1).elementHandle();
  await paste(page, { html: '<span data-mw-node="test:reference" data-id="incoming"><u>New</u></span>' });
  await expect(cell.locator('p')).toHaveJSProperty('innerHTML', 'Alpha <span data-mw-node="test:reference" data-id="incoming"><u>New</u></span><span data-mw-node="test:reference" data-id="retained">ta</span> tail');
  await expect(cell).toHaveAttribute('rowspan', '2');
  await expect(cell).toHaveAttribute('colspan', '2');
  await expect(page.locator('.mw-content td').nth(1)).toHaveText('A');
  await expect(page.locator('.mw-content td').nth(2)).toHaveText('B');
  expect(await neighbor!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelectorAll('td')[1])).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await expect(cell.locator('[data-id="retained"]')).toHaveText('ta');
});
