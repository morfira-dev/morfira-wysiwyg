import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import './text-tools.types.js';

const initialize = async (page: Page, value: string) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    const path = '/packages/plugins/dist/format-painter.js';
    const { formatPainter, formatPainterCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/format-painter');
    window.dispose();
    const host = document.createElement('div');
    document.body.append(host);
    window.editor = window.createEditor(host, { value, plugins: [formatPainter()] });
    window.formatPainterAPI = formatPainterCommands(window.editor);
    window.dispose = () => { window.editor.destroy(); host.remove(); };
  }, value);
};

test('painter replaces selected inline formats, preserves link/unselected text and groups one history entry', async ({ page }) => {
  await initialize(page, '<p><strong><span style="color: #ff0000; font-family: Georgia; font-size: 24px">Source</span></strong></p><p>Keep <a href="https://example.com"><em>Target</em></a> tail</p>');
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    root.focus();
    const source = root.querySelector('span')!.firstChild!;
    const target = root.querySelector('em')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(source, 1, source, 4);
    const captured = window.formatPainterAPI.capture();
    const observational = !editor.canUndo();
    document.getSelection()!.setBaseAndExtent(target, 5, target, 1);
    const applied = window.formatPainterAPI.apply();
    const formats = editor.getFormats();
    return { captured, observational, applied, bold: formats.bold, italic: Boolean(formats.italic), color: formats.color, family: formats.fontFamily, size: formats.fontSize, text: root.textContent, link: root.querySelector('a')?.getAttribute('href'), selected: document.getSelection()!.toString() };
  })).toEqual({ captured: true, observational: true, applied: true, bold: true, italic: false, color: 'rgb(255, 0, 0)', family: 'Georgia', size: '24px', text: 'SourceKeep Target tail', link: 'https://example.com', selected: 'arge' });
  const changed = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(changed);
});

test('plain capture resets text marks without copying links or paragraph layout; mixed and structural capture refuse', async ({ page }) => {
  await initialize(page, '<p style="line-height: 2">Plain</p><p><a href="https://example.com"><strong>Bold</strong></a> normal</p><ul><li><p>Nested</p></li></ul>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    root.focus();
    editor.setSelection(1);
    const plain = window.formatPainterAPI.capture();
    const bold = root.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(bold, 0, bold, 4);
    const apply = window.formatPainterAPI.apply();
    const reset = !editor.getFormats().bold && root.querySelector('a')?.getAttribute('href') === 'https://example.com' && !(root.children[1] as HTMLElement).style.lineHeight;
    const left = root.querySelector('p')!.firstChild!;
    const right = root.querySelector('li p')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(left, 0, right, 3);
    const structural = window.formatPainterAPI.capture();
    editor.setHTML('<p><strong>A</strong>B</p>');
    const paragraph = root.querySelector('p')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    const mixed = window.formatPainterAPI.capture();
    return { plain, apply, reset: Boolean(reset), structural, mixed, cleared: !window.formatPainterAPI.getState().captured };
  })).toEqual({ plain: true, apply: true, reset: true, structural: false, mixed: false, cleared: true });
});

test('painter ownership, read-only/composition and focus-time revalidation prevent stale edits', async ({ page }) => {
  await initialize(page, '<p><strong>Source</strong></p><p>Target</p>');
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const root = editor.surface;
    root.focus();
    editor.setSelection(1);
    window.formatPainterAPI.capture();
    const selectTarget = (): void => {
      const text = root.querySelectorAll('p')[1].firstChild!;
      document.getSelection()!.setBaseAndExtent(text, 0, text, text.textContent!.length);
    };
    selectTarget();
    editor.setReadOnly(true);
    const readOnly = window.formatPainterAPI.apply();
    editor.setReadOnly(false);
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = window.formatPainterAPI.apply();
    const captureDuringComposition = window.formatPainterAPI.capture();
    editor.setReadOnly(true);
    editor.setReadOnly(false);
    // Cancelling composition can rebuild native boundaries. Establish a fresh
    // supported target before verifying the plugin's composition latch clears.
    selectTarget();
    const captureAfterCancellation = window.formatPainterAPI.getState().canCapture;
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const originalFocus = editor.focus;
    let focusRedirectRan = false;
    // Exercise the public focus boundary deterministically: native button focus
    // can evacuate Selection in WebKit before the guarded API is invoked.
    editor.focus = () => {
      originalFocus();
      focusRedirectRan = true;
      const text = root.querySelector('strong')!.firstChild!;
      document.getSelection()!.setBaseAndExtent(text, 0, text, 1);
    };
    const redirected = window.formatPainterAPI.apply();
    editor.focus = originalFocus;
    const html = editor.getHTML();
    const api = window.formatPainterAPI;
    editor.destroy();
    let disposed = false;
    try { api.capture(); } catch { disposed = true; }
    return { readOnly, composing, captureDuringComposition, captureAfterCancellation, focusRedirectRan, redirected, html, disposed };
  })).toEqual({ readOnly: false, composing: false, captureDuringComposition: false, captureAfterCancellation: true, focusRedirectRan: true, redirected: false, html: '<p><strong>Source</strong></p><p>Target</p>', disposed: true });
});
