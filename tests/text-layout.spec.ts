import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './text-tools.types.js';

const initialize = async (page: Page, value: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    const path = '/packages/plugins/dist/text-layout.js';
    const { textLayout, textLayoutCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/text-layout');
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.editor = window.createEditor(host, { value, plugins: [textLayout()] });
    window.textLayoutAPI = textLayoutCommands(window.editor);
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, value);
};

test('paragraph layout preserves backward siblings, actual nodes and separate one-step history', async ({ page }) => {
  await initialize(page, '<p><strong>Alpha</strong></p><h2><em>Beta</em></h2><p>Keep</p>');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    const left = root.querySelector('strong')!.firstChild!;
    const right = root.querySelector('em')!.firstChild!;
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(right, 3, left, 1);
    window.textLayoutAPI.setLineHeight(1.5);
    const result = { retained: root.contains(left) && root.contains(right), backward: selection.anchorNode === right && selection.focusNode === left && selection.anchorOffset === 3 && selection.focusOffset === 1,
      values: [...root.children].map((node) => (node as HTMLElement).style.lineHeight), state: window.textLayoutAPI.getState() };
    return result;
  })).toEqual({ retained: true, backward: true, values: ['1.5', '1.5', ''], state: { disabled: false, lineHeight: 1.5, spaceBefore: false, spaceAfter: false, lineHeightMixed: false, spaceBeforeMixed: false, spaceAfterMixed: false } });
  await page.evaluate(() => window.textLayoutAPI.setSpaceAfter(16));
  const changed = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => [...window.editor.surface.children].map((node) => [(node as HTMLElement).style.lineHeight, (node as HTMLElement).style.marginBottom]))).toEqual([['1.5', ''], ['1.5', ''], ['', '']]);
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(changed);
  await page.evaluate(() => { window.textLayoutAPI.setLineHeight(false); window.textLayoutAPI.setSpaceAfter(false); });
  expect(await page.evaluate(() => window.editor.surface.textContent)).toBe('AlphaBetaKeep');
});

test('nested list and quote layouts stay local; mixed/reset and cross-owner barriers are explicit', async ({ page }) => {
  await initialize(page, '<ul><li><blockquote><p style="line-height: 1.5">One</p><h3>Two</h3></blockquote><ul><li><p>Branch</p></li></ul><p>After</p></li></ul><table><tbody><tr><td><p>Cell</p></td><td><p>Other</p></td></tr></tbody></table>');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    const left = root.querySelector('blockquote p')!;
    const right = root.querySelector('h3')!;
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(left.firstChild!, 1, right.firstChild!, 2);
    const mixed = window.textLayoutAPI.getState();
    window.textLayoutAPI.setSpaceBefore(12);
    const margins = [left, right].map((node) => (node as HTMLElement).style.marginTop);
    const unaffected = [...root.querySelectorAll('p,h3')].filter((node) => node !== left && node !== right).every((node) => !(node as HTMLElement).style.marginTop);
    selection.setBaseAndExtent(left.firstChild!, 1, root.querySelector('li>p')!.firstChild!, 2);
    const before = window.editor.getHTML();
    const disabled = window.textLayoutAPI.getState().disabled;
    window.textLayoutAPI.setLineHeight(2);
    const refused = window.editor.getHTML() === before;
    const cells = root.querySelectorAll('td p');
    selection.setBaseAndExtent(cells[0].firstChild!, 1, cells[1].firstChild!, 1);
    const crossCell = window.textLayoutAPI.getState().disabled;
    selection.setBaseAndExtent(left.firstChild!, 1, left.firstChild!, 1);
    window.textLayoutAPI.setLineHeight(false);
    return { mixed: mixed.lineHeightMixed, margins, unaffected, disabled, refused, crossCell, reset: window.textLayoutAPI.getState().lineHeight };
  })).toEqual({ mixed: true, margins: ['12px', '12px'], unaffected: true, disabled: true, refused: true, crossCell: true, reset: false });
});

test('bounded styles round-trip without plugin and reject unsafe units, owners and command payloads', async ({ page }) => {
  await initialize(page, '<p style="line-height: 1.250; margin-top: 12px; margin-bottom: 96px">Safe</p><p style="line-height: 200%; margin-top: -1px; margin-bottom: 97px">Bad</p><p style="line-height: calc(1 + 1); margin-top: var(--x); margin-bottom: 1em">CSS</p><pre style="line-height: 2; margin-top: 12px">Code</pre><p><span style="line-height: 2; margin-top: 12px">Inline</span></p>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const html = editor.getHTML();
    const json = editor.getJSON();
    editor.setJSON(json);
    const roundTrip = html === editor.getHTML();
    const root = editor.surface;
    root.focus();
    const text = root.querySelector('p')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 1, text, 1);
    let rejected = 0;
    for (const value of [NaN, Infinity, -1, 4.001, 1.2345, 'url(x)', null]) {
      try { window.textLayoutAPI.setLineHeight(value as number); }
      catch { rejected++; }
    }
    for (const value of [-1, 97, 1.5, '12px', null]) {
      try { window.textLayoutAPI.setSpaceBefore(value as number); }
      catch { rejected++; }
    }
    const values = [...root.querySelectorAll('p,pre,span')].map((node) => node.getAttribute('style'));
    const empty = document.createElement('div');
    document.body.append(empty);
    const plain = window.createEditor(empty, { value: html });
    const noPlugin = plain.getHTML() === html;
    plain.destroy();
    empty.remove();
    return { roundTrip, rejected, values, noPlugin, same: editor.getHTML() === html, history: editor.canUndo() };
  })).toEqual({ roundTrip: true, rejected: 12, values: ['line-height: 1.25; margin-top: 12px; margin-bottom: 96px', null, null, null, null, null], noPlugin: true, same: true, history: false });
});

test('read-only, composition and disposed layout commands do not mutate the target', async ({ page }) => {
  await initialize(page, '<p>Text</p>');
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    window.editor.setSelection(1);
    window.editor.setReadOnly(true);
    window.textLayoutAPI.setLineHeight(2);
    const readOnly = window.textLayoutAPI.getState().disabled;
    window.editor.setReadOnly(false);
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.textLayoutAPI.setSpaceAfter(24);
    const composing = window.textLayoutAPI.getState().disabled;
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const html = window.editor.getHTML();
    const api = window.textLayoutAPI;
    window.editor.destroy();
    let disposed = false;
    try { api.setLineHeight(2); } catch { disposed = true; }
    return { readOnly, composing, html, disposed };
  })).toEqual({ readOnly: true, composing: true, html: '<p>Text</p>', disposed: true });
});

test('focus callbacks cannot redirect text-layout API or replace the saved native-select target', async ({ page }) => {
  await initialize(page, '<p>First</p><p>Second</p>');
  expect(await page.evaluate(async () => {
    const editor = window.editor;
    const root = editor.surface;
    root.focus();
    editor.setSelection(1);
    const outside = document.createElement('button');
    document.body.append(outside);
    const originalFocus = editor.focus;
    let apiFocusRan = false;
    editor.focus = () => {
      originalFocus();
      apiFocusRan = true;
      editor.setSelection(6);
    };
    window.textLayoutAPI.setLineHeight(2);
    editor.focus = originalFocus;
    const apiRefused = root.querySelectorAll('[style]').length === 0;
    const path = '/packages/plugins/dist/ui/text-layout.js';
    const { createTextLayoutUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/text-layout');
    const host = document.createElement('div');
    document.body.append(host);
    const ui = createTextLayoutUI(host, editor);
    editor.setSelection(1);
    ui.refresh();
    const select = ui.element.querySelector('select')!;
    select.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    select.addEventListener('focus', () => editor.setSelection(6), { capture: true, once: true });
    select.focus();
    select.value = '1.5';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const intentRefused = root.querySelectorAll('[style]').length === 0;
    editor.setSelection(1);
    select.focus();
    editor.setHTML('<p>Replacement</p>');
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const staleRefused = editor.getHTML() === '<p>Replacement</p>';
    editor.setLocale('ru');
    const russian = select.getAttribute('aria-label');
    editor.setReadOnly(true);
    const disabled = select.disabled;
    ui.destroy();
    const removed = host.childNodes.length === 0;
    host.remove();
    outside.remove();
    return { apiFocusRan, apiRefused, intentRefused, staleRefused, russian, disabled, removed };
  })).toEqual({ apiFocusRan: true, apiRefused: true, intentRefused: true, staleRefused: true, russian: 'Межстрочный интервал', disabled: true, removed: true });
});
