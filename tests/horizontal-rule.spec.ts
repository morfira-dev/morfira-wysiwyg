import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaContribution } from '@morfira-dev/wysiwyg';
import type { HorizontalRuleCommands } from '@morfira-dev/wysiwyg/plugins/horizontal-rule';

declare global { interface Window { horizontalRuleAPI: HorizontalRuleCommands; } }

const initialize = async (page: Page, html: string, schema: SchemaContribution[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ html, schema }) => {
    const modulePath = '/packages/plugins/dist/horizontal-rule.js';
    const { horizontalRule, horizontalRuleCommands } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/plugins/horizontal-rule');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'horizontal-rule-test';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value: html, schema, plugins: [horizontalRule()], onChange: (change) => window.changes.push(change) });
    window.horizontalRuleAPI = horizontalRuleCommands(window.editor);
    window.dispose = () => window.editor.destroy();
  }, { html, schema });
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

// Representative source/edge choices cover distinct failures. Browser projects
// provide engine coverage without multiplying every tag, direction and edge.
test('a rich backward range becomes sibling HR with exact selection history and an editable suffix', async ({ page }) => {
  const before = '<p title="Source" style="text-align: center">A<strong>bcXYde</strong>F</p><p title="Keep">Keep</p>';
  await initialize(page, before);
  const kept = await page.locator('.horizontal-rule-test [title="Keep"]').elementHandle();
  await page.evaluate(() => {
    const editor = window.editor;
    editor.surface.focus();
    const text = editor.surface.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 4, text, 2);
    window.horizontalRuleAPI.insert();
  });
  const inserted = '<p title="Source" style="text-align: center">A<strong>bc</strong></p><hr><p title="Source" style="text-align: center"><strong>de</strong>F</p><p title="Keep">Keep</p>';
  expect(await html(page)).toBe(inserted);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const hr = root.querySelector('hr')!;
    const caret = document.getSelection()!;
    const suffix = hr.nextElementSibling!;
    const range = document.createRange();
    range.selectNodeContents(suffix);
    range.setEnd(caret.anchorNode!, caret.anchorOffset);
    return { rootHR: hr.parentElement === root, attributes: hr.attributes.length, collapsed: caret.isCollapsed, suffixCaret: suffix === caret.anchorNode || suffix.contains(caret.anchorNode), beforeCaret: range.toString(), changes: window.changes.map((change) => change.source) };
  })).toEqual({ rootHR: true, attributes: 0, collapsed: true, suffixCaret: true, beforeCaret: '', changes: ['user'] });
  expect(await kept!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild;
    const selection = document.getSelection()!;
    return { anchor: selection.anchorNode === text, focus: selection.focusNode === text, anchorOffset: selection.anchorOffset, focusOffset: selection.focusOffset, undo: window.editor.canUndo() };
  })).toEqual({ anchor: true, focus: true, anchorOffset: 4, focusOffset: 2, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(inserted);
  await page.keyboard.type('X');
  await expect(page.locator('.horizontal-rule-test hr + p')).toHaveText('XdeF');
});

test('collapsed paragraph and heading edges retain both editable wrappers, including an empty heading', async ({ page }) => {
  await initialize(page, '<p>AB</p>');
  const samples = [
    { value: '<p>AB</p>', offset: 0, expected: '<p><br></p><hr><p>AB</p>' },
    { value: '<h2 title="Heading">AB</h2>', offset: 2, expected: '<h2 title="Heading">AB</h2><hr><h2 title="Heading"><br></h2>' },
    { value: '<h3><br></h3>', offset: 0, expected: '<h3><br></h3><hr><h3><br></h3>' },
  ];
  for (const sample of samples) {
    await page.evaluate(({ value, offset }) => {
      window.editor.setHTML(value);
      const block = window.editor.surface.firstElementChild!;
      const node = block.firstChild?.nodeType === Node.TEXT_NODE ? block.firstChild : block;
      window.editor.surface.focus();
      document.getSelection()!.setBaseAndExtent(node, offset, node, offset);
      window.horizontalRuleAPI.insert();
    }, sample);
    expect(await html(page)).toBe(sample.expected);
    expect(await page.evaluate(() => {
      const suffix = window.editor.surface.querySelector('hr')!.nextElementSibling!;
      const selection = document.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(suffix);
      range.setEnd(selection.anchorNode!, selection.anchorOffset);
      return { suffixCaret: suffix === selection.anchorNode || suffix.contains(selection.anchorNode), collapsed: selection.isCollapsed, beforeCaret: range.toString() };
    })).toEqual({ suffixCaret: true, collapsed: true, beforeCaret: '' });
    await page.keyboard.type('Z');
    await expect(page.locator('.horizontal-rule-test hr + *')).toHaveText(sample.value.includes('<p>') ? 'ZAB' : 'Z');
  }
});

test('unsupported roots, containers and semantic descendants refuse atomically without clearing redo', async ({ page }) => {
  const reference: SchemaContribution = { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } };
  await initialize(page, '<p title="A">AB</p><p title="B">CD</p><p title="Semantic">Ordinary <span data-mw-node="test:reference" data-id="owned">Owned</span></p><p title="Image">Text<img src="/logo.svg" alt="Retained image"></p><ul><li title="List">Item</li></ul><blockquote><p title="Quote">Quote</p></blockquote><table><tbody><tr><td><p title="Cell">Cell</p></td></tr></tbody></table><pre title="Code">Code</pre>', [reference]);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    editor.setSelection(1);
    window.horizontalRuleAPI.insert();
    editor.undo();
    const before = editor.getHTML();
    const changes = window.changes.length;
    const select = (selector: string): Node => root.querySelector(selector)!.firstChild!;
    const cases: Array<[Node, number, Node, number]> = [
      [root, 1, root, 1],
      [select('[title="A"]'), 1, select('[title="B"]'), 1],
      ...['Semantic', 'Image', 'List', 'Quote', 'Cell', 'Code'].map((title): [Node, number, Node, number] => [select(`[title="${title}"]`), 1, select(`[title="${title}"]`), 1]),
    ];
    return cases.map(([anchor, anchorOffset, focus, focusOffset]) => {
      root.focus();
      const selection = document.getSelection()!;
      selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
      const disabled = window.horizontalRuleAPI.getState().disabled;
      window.horizontalRuleAPI.insert();
      return { disabled, html: editor.getHTML() === before, selection: selection.anchorNode === anchor && selection.focusNode === focus && selection.anchorOffset === anchorOffset && selection.focusOffset === focusOffset, changes: window.changes.length === changes, redo: editor.canRedo(), undo: editor.canUndo() };
    });
  })).toEqual(Array.from({ length: 8 }, () => ({ disabled: true, html: true, selection: true, changes: true, redo: true, undo: false })));
});

test('a synchronous native range drops stale caret marks while a collapsed insertion retains its affinity', async ({ page }) => {
  await initialize(page, '<p>ABCDE</p>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setSelection(0);
    editor.format('bold', true);
    const pendingBefore = editor.getFormats().bold === true;
    const text = editor.surface.querySelector('p')!.firstChild!;
    // No task/event boundary may clear stale typing overrides before insertion.
    document.getSelection()!.setBaseAndExtent(text, 0, text, 2);
    window.horizontalRuleAPI.insert();
    return { pendingBefore, boldAfter: editor.getFormats().bold === true, html: editor.getHTML() };
  })).toEqual({ pendingBefore: true, boldAfter: false, html: '<p><br></p><hr><p>CDE</p>' });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const selection = document.getSelection()!;
    const text = editor.surface.querySelector('p')!.firstChild;
    return { html: editor.getHTML(), anchor: selection.anchorNode === text, focus: selection.focusNode === text, start: selection.anchorOffset, end: selection.focusOffset, staleBold: editor.getFormats().bold === true, undo: editor.canUndo() };
  })).toEqual({ html: '<p>ABCDE</p>', anchor: true, focus: true, start: 0, end: 2, staleBold: false, undo: false });
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('X');
  await expect(page.locator('.horizontal-rule-test hr + p')).toHaveText('XCDE');
  await expect(page.locator('.horizontal-rule-test hr + p strong')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setHTML('<p>ABCDE</p>');
    editor.setSelection(0);
    editor.format('bold', true);
    window.horizontalRuleAPI.insert();
    return editor.getFormats().bold === true;
  })).toBe(true);
  await page.keyboard.type('X');
  await expect(page.locator('.horizontal-rule-test hr + p strong')).toHaveText('X');
  await expect(page.locator('.horizontal-rule-test hr + p')).toHaveText('XABCDE');
});

test('read-only and composition disable insertion while external replacement and later edits remain available', async ({ page }) => {
  await initialize(page, '<p>Source</p>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setSelection(2);
    editor.setReadOnly(true);
    const readonly = window.horizontalRuleAPI.getState().disabled;
    window.horizontalRuleAPI.insert();
    const guarded = editor.getHTML();
    editor.setHTML('<p>External</p>');
    editor.setReadOnly(false);
    editor.setSelection(2);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = window.horizontalRuleAPI.getState().disabled;
    window.horizontalRuleAPI.insert();
    const during = editor.getHTML();
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    return { readonly, composing, guarded, during, changes: window.changes.map((change) => change.source), undo: editor.canUndo(), enabled: !window.horizontalRuleAPI.getState().disabled };
  })).toEqual({ readonly: true, composing: true, guarded: '<p>Source</p>', during: '<p>External</p>', changes: ['api'], undo: false, enabled: true });
  await page.evaluate(() => window.horizontalRuleAPI.insert());
  expect(await html(page)).toBe('<p>Ex</p><hr><p>ternal</p>');
});

test('saved-range state is a read-only projection and never authorizes insertion outside the editor', async ({ page }) => {
  await initialize(page, '<p>Source</p>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const api = window.horizontalRuleAPI;
    const text = editor.surface.querySelector('p')!.firstChild!;
    const saved = document.createRange();
    saved.setStart(text, 2);
    saved.collapse(true);
    const outside = document.createElement('div');
    outside.textContent = 'Outside';
    document.body.append(outside);
    const outsideText = outside.firstChild!;
    const outsideRange = document.createRange();
    outsideRange.setStart(outsideText, 1);
    outsideRange.collapse(true);
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(outsideText, 1, outsideText, 1);
    const before = editor.getHTML();
    const projected = api.getState(saved).disabled;
    const nativeOutside = api.getState().disabled;
    const selectionUntouched = selection.anchorNode === outsideText && selection.focusNode === outsideText && selection.anchorOffset === 1 && selection.focusOffset === 1;
    api.insert();
    const noAuthorization = editor.getHTML() === before && !editor.canUndo() && window.changes.length === 0 && selection.anchorNode === outsideText && selection.anchorOffset === 1;
    editor.setReadOnly(true);
    const readonly = api.getState(saved).disabled;
    editor.setReadOnly(false);
    editor.surface.focus();
    selection.setBaseAndExtent(text, 2, text, 2);
    const foreign = api.getState(outsideRange).disabled;
    const nativeInside = api.getState().disabled;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = api.getState(saved).disabled;
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    return { projected, nativeOutside, selectionUntouched, noAuthorization, readonly, foreign, nativeInside, composing, unchanged: editor.getHTML() === before && !editor.canUndo() && window.changes.length === 0 };
  })).toEqual({ projected: false, nativeOutside: true, selectionUntouched: true, noAuthorization: true, readonly: true, foreign: true, nativeInside: false, composing: true, unchanged: true });
});

test('instance ownership and disposal keep stale handles inert without affecting another editor', async ({ page }) => {
  await initialize(page, '<p>First</p>');
  expect(await page.evaluate(async () => {
    const modulePath = '/packages/plugins/dist/horizontal-rule.js';
    const { horizontalRule, horizontalRuleCommands } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/plugins/horizontal-rule');
    const host = document.createElement('div');
    document.body.append(host);
    const second = window.createEditor(host, { value: '<p>Second</p>', plugins: [horizontalRule()] });
    const commands = horizontalRuleCommands(second);
    second.setSelection(3);
    commands.insert();
    const first = window.editor.getHTML();
    window.editor.destroy();
    let disposed = 0;
    for (const call of [window.horizontalRuleAPI.insert, window.horizontalRuleAPI.getState]) {
      try { call(); } catch { disposed++; }
    }
    const surviving = second.getHTML();
    second.undo();
    const secondUndo = second.getHTML();
    second.destroy();
    return { first, surviving, secondUndo, disposed };
  })).toEqual({ first: '<p>First</p>', surviving: '<p>Sec</p><hr><p>ond</p>', secondUndo: '<p>Second</p>', disposed: 2 });
});
