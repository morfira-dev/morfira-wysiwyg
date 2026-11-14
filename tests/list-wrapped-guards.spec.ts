import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaNodeSpec } from '@morfira-dev/wysiwyg';

const original = '<ul><li><p style="text-align:center">Alpha <strong>one</strong></p></li><li><h3 style="text-align:right"><em>Beta</em> tail</h3><ul><li>Nested keep</li></ul></li><li>Keep item</li></ul><p>Outside</p>';
const replaced = '<ul><li><p style="text-align:center">Alpha <u>X</u><em>ta</em> tail</p><ul><li>Nested keep</li></ul></li><li>Keep item</li></ul><p>Outside</p>';
const reference: SchemaNodeSpec = { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } };
const body: SchemaNodeSpec = { name: 'test:body', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } };

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

const selectBackwards = async (page: Page) => page.evaluate(() => {
  const root = window.editor.surface;
  const items = root.querySelectorAll(':scope > ul > li');
  root.focus();
  document.getSelection()!.setBaseAndExtent(items[1].querySelector('em,span')!.firstChild!, 2, items[0].querySelector('p')?.firstChild ?? items[0].firstChild!, 6);
});

const paste = async (page: Page, html: string, text = 'Wrong plain text') => page.evaluate(({ html, text }) => {
  const data = new DataTransfer();
  data.setData('text/html', html);
  data.setData('text/plain', text);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
  return event.defaultPrevented;
}, { html, text });

test('wrapped bodies: canceled list input and paste preserve the original backward selection and permit later insertion', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const cancel = (event: Event) => event.preventDefault();
    root.addEventListener('beforeinput', cancel, { capture: true, once: true });
    root.addEventListener('paste', cancel, { capture: true, once: true });
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'Blocked', bubbles: true, cancelable: true });
    root.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(result).toBe(true);
  await paste(page, '<u>Blocked</u>');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: original, selection: { index: 6, length: 5 }, changes: 0, undo: false });
  await paste(page, '<u>X</u>');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length }))).toEqual({ html: replaced, selection: { index: 7, length: 0 }, changes: 1 });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('wrapped bodies: noncancelable and composition-flagged input retain native ownership without modifying list items', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const prevented = ['insertText', 'deleteContentBackward', 'deleteContentForward'].map((inputType) => {
      const event = new InputEvent('beforeinput', { inputType, data: 'X', bubbles: true, cancelable: false });
      root.dispatchEvent(event);
      return event.defaultPrevented;
    });
    const composing = new InputEvent('beforeinput', { inputType: 'insertText', data: '候補', isComposing: true, bubbles: true, cancelable: true });
    root.dispatchEvent(composing);
    return { prevented, composingPrevented: composing.defaultPrevented, html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ prevented: [false, false, false], composingPrevented: false, html: original, changes: 0, undo: false });
});

for (const mode of ['read-only', 'composition'] as const) test(`${mode} blocks list replacement while a fresh external value remains authoritative`, async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  await page.evaluate((mode) => {
    if (mode === 'read-only') window.editor.setReadOnly(true);
    else window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.insertHTML('<u>Blocked</u>');
    window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'Blocked', bubbles: true, cancelable: true }));
  }, mode);
  await paste(page, '<u>Blocked</u>');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() }))).toEqual({ html: original, changes: 0, undo: false });
  const baseline = await page.evaluate((mode) => {
    window.editor.setHTML('<ul><li><p>New</p></li><li><h2><em>Body</em></h2></li><li>Stay</li></ul><p>After</p>');
    if (mode === 'read-only') window.editor.setReadOnly(false);
    else window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('em')!.firstChild!, 2, root.querySelector('li > p')!.firstChild!, 1);
    return window.changes.length;
  }, mode);
  await paste(page, '<u>Y</u>');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, source: window.changes.at(-1)?.source }))).toEqual({ html: '<ul><li><p>N<u>Y</u><em>dy</em></p></li><li>Stay</li></ul><p>After</p>', selection: { index: 2, length: 0 }, changes: baseline + 1, source: 'user' });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: '<ul><li><p>New</p></li><li><h2><em>Body</em></h2></li><li>Stay</li></ul><p>After</p>', undo: false });
});

test('wrapped bodies: unsupported multi-item payloads reject before DOM mutation and preserve branches selection and history', async ({ page }) => {
  await initialize(page, original, [body]);
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const first = root.querySelector('li');
    const branch = root.querySelector('li > ul');
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    const rejected = ['<p>A</p><blockquote><p>B</p></blockquote>', '<pre>Unsupported</pre>', '<ul><li>New branch</li></ul>', '<p data-mw-node="test:body" data-id="owned">Semantic</p>'].map((html) => {
      try { window.editor.insertHTML(html); return false; }
      catch (error) { return error instanceof Error; }
    });
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    return { rejected, mutations, firstSame: first === root.querySelector('li'), branchSame: branch === root.querySelector('li > ul'), html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo(), changes: window.changes.length };
  });
  expect(result).toEqual({ rejected: [true, true, true, true], mutations: 0, firstSame: true, branchSame: true, html: original, selection: { index: 6, length: 5 }, undo: false, changes: 0 });
});

test('wrapped bodies: a caught invalid nested list import poisons the complete outer edit rather than retaining its earlier mutation', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    let rejected = false;
    try {
      window.editor.transact((root) => {
        root.lastElementChild!.append(document.createTextNode('!'));
        try { window.editor.insertHTML('<p>A</p><blockquote><p>B</p></blockquote>'); }
        catch { /* Catching an inner validation failure must not commit the outer edit. */ }
      });
    }
    catch (error) { rejected = error instanceof Error; }
    return { rejected, html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length, undo: window.editor.canUndo(), redo: window.editor.canRedo() };
  });
  expect(result).toEqual({ rejected: true, html: original, selection: { index: 6, length: 5 }, changes: 0, undo: false, redo: false });
});

test('wrapped bodies: invalid inline schema data rejects before a list cut and retains existing undo history', async ({ page }) => {
  await initialize(page, original, [reference]);
  await page.evaluate(() => window.editor.transact((root) => root.lastElementChild!.append(document.createTextNode('!'))));
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const before = { html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length };
    const first = window.editor.surface.querySelector('li');
    let rejected = false;
    try { window.editor.insertHTML('<span data-mw-node="test:reference">Missing required id</span>'); }
    catch (error) { rejected = error instanceof TypeError; }
    return { rejected, sameFirst: first === window.editor.surface.querySelector('li'), before, after: { html: window.editor.getHTML(), selection: window.editor.getSelection(), changes: window.changes.length }, undo: window.editor.canUndo() };
  });
  expect(result.rejected).toBe(true);
  expect(result.sameFirst).toBe(true);
  expect(result.after).toEqual(result.before);
  expect(result.undo).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
});

test('wrapped bodies: empty stripped HTML remains a no-op for both eligible and unsupported list selections', async ({ page }) => {
  for (const nested of [false, true]) {
    const html = nested ? '<ul><li><p>Alpha <strong>one</strong></p><ul><li>Branch</li></ul></li><li><h3><em>Beta</em> tail</h3></li></ul><p>Outside</p>' : original;
    await initialize(page, html);
    await selectBackwards(page);
    const before = await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }));
    const errors: string[] = [];
    const record = (error: Error) => errors.push(error.message);
    page.on('pageerror', record);
    await paste(page, '<script>bad()</script>', 'Do not fall back');
    page.off('pageerror', record);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ ...before, undo: false, changes: 0 });
  }
});

test('wrapped bodies: inline semantic suffixes and unselected nested branches retain metadata during sanitized list paste', async ({ page }) => {
  const html = '<ul><li><p>Alpha <strong>one</strong></p></li><li><h2><span data-mw-node="test:reference" data-id="kept">Beta</span> tail</h2><ul><li>Nested keep</li></ul></li><li>Keep item</li></ul><p>Outside</p>';
  await initialize(page, html, [reference]);
  await selectBackwards(page);
  const branch = await page.locator('.mw-content > ul > li > ul').elementHandle();
  const keep = await page.locator('.mw-content > ul > li').last().elementHandle();
  await paste(page, '<u onclick="bad()">X</u>');
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<ul><li><p>Alpha <u>X</u><span data-mw-node="test:reference" data-id="kept">ta</span> tail</p><ul><li>Nested keep</li></ul></li><li>Keep item</li></ul><p>Outside</p>');
  expect(await branch!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector('li > ul'))).toBe(true);
  expect(await keep!.evaluate((element) => element.isConnected && element === window.editor.surface.querySelector(':scope > ul')!.lastElementChild)).toBe(true);
  await expect(page.locator('.mw-content [onclick]')).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(html);
});

test('wrapped bodies: a cached backward selection survives toolbar focus without rebuilding the retained wrapper', async ({ page }) => {
  await initialize(page);
  await selectBackwards(page);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const first = root.querySelector('li')!;
    const wrapper = first.querySelector('p')!;
    const branch = root.querySelector('li > ul')!;
    document.dispatchEvent(new Event('selectionchange'));
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    document.getSelection()!.removeAllRanges();
    window.editor.insertHTML('<u onclick="bad()">X</u>');
    button.remove();
    return {
      html: window.editor.getHTML(), changes: window.changes.length,
      firstSame: first === root.querySelector('li'), wrapperSame: wrapper === first.firstElementChild,
      branchSame: branch.parentElement === first, branchOutside: branch.parentElement !== wrapper,
      unsafe: root.querySelector('[onclick]') !== null,
    };
  });
  expect(result).toEqual({ html: replaced, changes: 1, firstSame: true, wrapperSame: true, branchSame: true, branchOutside: true, unsafe: false });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(original);
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const root = window.editor.surface;
    return { anchorRight: selection.anchorNode === root.querySelector('h3 em')!.firstChild, anchor: selection.anchorOffset, focusLeft: selection.focusNode === root.querySelector('li p')!.firstChild, focus: selection.focusOffset };
  })).toEqual({ anchorRight: true, anchor: 2, focusLeft: true, focus: 6 });
});

test('wrapped bodies: semantic roots and unsupported structural bodies reject without touching original DOM', async ({ page }) => {
  for (const first of [
    '<p data-mw-node="test:body" data-id="owned">Alpha <strong>one</strong></p>',
    '<p>Alpha <strong>one</strong></p><pre>Second</pre>',
    '<p>Alpha <strong>one</strong><img src="/logo.svg" alt="Original"></p>',
  ]) {
    await initialize(page, `<ul><li>${first}</li><li><h3><em>Beta</em> tail</h3></li></ul><p>Outside</p>`, [body]);
    await selectBackwards(page);
    const result = await page.evaluate(() => {
      const root = window.editor.surface;
      const wrapper = root.querySelector('li > p')!;
      const before = window.editor.getHTML();
      const selection = window.editor.getSelection();
      const observer = new MutationObserver(() => {});
      observer.observe(root, { subtree: true, childList: true, attributes: true });
      const event = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true });
      root.dispatchEvent(event);
      let rejected = false;
      try { window.editor.insertHTML('<u>X</u>'); }
      catch (error) { rejected = error instanceof Error; }
      const mutations = observer.takeRecords().length;
      observer.disconnect();
      return { sameHTML: before === window.editor.getHTML(), beforeSelection: selection, afterSelection: window.editor.getSelection(), sameWrapper: wrapper === root.querySelector('li > p'), prevented: event.defaultPrevented, rejected, mutations, changes: window.changes.length, undo: window.editor.canUndo() };
    });
    expect(result).toMatchObject({ sameHTML: true, sameWrapper: true, prevented: true, rejected: true, mutations: 0, changes: 0, undo: false });
    expect(result.afterSelection).toEqual(result.beforeSelection);
  }
});
