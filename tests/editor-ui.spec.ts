import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { EditorUIController } from '@morfira-dev/wysiwyg/ui/editor';

const initialize = async (page: Page, value = '<p>Hello world</p>') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    const host = document.createElement('div');
    const tools = document.createElement('div');
    document.body.append(host, tools);
    window.editor = window.createEditor(host, { value, locale: 'en' });
    window.editor.setSelection(0, 5);
    const path = '/packages/plugins/dist/ui/editor.js';
    const module = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/editor');
    const ui = module.createEditorUI(tools, window.editor);
    window.editor.providePlugin('test-editor-ui', ui);
    window.editor.providePlugin('test-editor-ui-module', module);
    window.editor.providePlugin('test-editor-ui-host', tools);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/packages/plugins/dist/ui/editor.css';
    document.head.append(css);
  }, value);
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

test('grouped icon actions preserve rich selection and undo/redo while exposing pressed state', async ({ page }) => {
  await initialize(page, '<p>Hello <em>world</em></p>');
  const tools = page.getByRole('toolbar', { name: 'Editor tools', exact: true });
  await tools.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(page.locator('.mw-content strong')).toHaveText('Hello');
  await expect(page.locator('.mw-content em')).toHaveText('world');
  await expect(tools.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 5 });
  await tools.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await html(page)).toBe('<p>Hello <em>world</em></p>');
  await tools.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.mw-content strong')).toHaveText('Hello');
  expect(await page.locator('.mw-content svg').count()).toBe(0);
});

test('block, list and alignment selectors retain a multi-paragraph range and mixed state', async ({ page }) => {
  await initialize(page, '<h2>First</h2><p>Second</p>');
  await page.evaluate(() => window.editor.setSelection(0, 11));
  await expect(page.getByLabel('Block format', { exact: true })).toHaveValue('mixed');
  await page.getByLabel('Block format', { exact: true }).selectOption('3');
  await expect(page.locator('.mw-content h3')).toHaveCount(2);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 11 });
  await page.getByLabel('List format', { exact: true }).selectOption('bullet');
  await expect(page.locator('.mw-content ul > li')).toHaveCount(2);
  await page.getByLabel('Text alignment', { exact: true }).selectOption('center');
  await expect(page.locator('.mw-content li').first()).toHaveCSS('text-align', 'center');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).not.toContain('text-align: center');
});

test('native color and reset controls restore the actual selected text and remain undoable', async ({ page }) => {
  await initialize(page);
  await page.getByLabel('Text color', { exact: true }).evaluate((input: HTMLInputElement) => {
    input.focus();
    input.value = '#123456';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.mw-content span')).toHaveText('Hello');
  await expect(page.locator('.mw-content span')).toHaveCSS('color', 'rgb(18, 52, 86)');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 5 });
  await page.getByRole('button', { name: 'Reset text color', exact: true }).click();
  expect(await html(page)).toBe('<p>Hello world</p>');
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.mw-content span')).toHaveCSS('color', 'rgb(18, 52, 86)');
});

test('backwards and empty merged-cell ranges survive native control focus', async ({ page }) => {
  await initialize(page, '<table><tbody><tr><td rowspan="2"><p><br></p><p>Hello</p></td><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  await page.evaluate(() => {
    const text = window.editor.surface.querySelectorAll('td p')[1].firstChild!;
    window.editor.surface.focus();
    document.getSelection()!.setBaseAndExtent(text, 5, text, 0);
  });
  await page.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(page.locator('.mw-content td[rowspan="2"] em')).toHaveText('Hello');
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    return selection.anchorOffset > selection.focusOffset;
  })).toBe(true);
  await page.evaluate(() => {
    const paragraph = window.editor.surface.querySelector('td p')!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(true);
    window.editor.surface.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await page.getByLabel('Block format', { exact: true }).selectOption('2');
  await page.keyboard.type('Title');
  await expect(page.locator('.mw-content td h2')).toHaveText('Title');
  await expect(page.locator('.mw-content td[rowspan="2"] em')).toHaveText('Hello');
});

test('roving toolbar focus skips disabled controls and native controls retain their own keys', async ({ page }) => {
  await initialize(page);
  const bold = page.getByRole('button', { name: 'Bold', exact: true });
  await bold.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Italic', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(bold).toBeFocused();
  const block = page.getByLabel('Block format', { exact: true });
  await block.focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.getByLabel('List format', { exact: true })).toBeFocused();
  expect(await page.locator('.mw-editor-toolbar [tabindex="0"]').count()).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.mw-content')).toBeFocused();
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 5 });
});

test('readonly guards mutating actions and composition cannot execute custom mutation callbacks', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    const ui = window.editor.getPlugin<EditorUIController>('test-editor-ui')!;
    const module = window.editor.getPlugin<typeof import('@morfira-dev/wysiwyg/ui/editor')>('test-editor-ui-module')!;
    const host = window.editor.getPlugin<HTMLElement>('test-editor-ui-host')!;
    ui.destroy();
    const state = { mutations: 0, panels: 0 };
    window.editor.providePlugin('test-ui-counts', state);
    const next = module.createEditorUI(host, window.editor, { groups: [[
      { id: 'change', label: 'Change', run: (editor) => { state.mutations++; editor.insertHTML('!'); } },
      { id: 'help', label: 'Help', mutates: false, run: () => { state.panels++; } },
    ]] });
    window.editor.providePlugin('test-next-ui', next);
    window.editor.setReadOnly(true);
  });
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('[data-mw-ui-action=change]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.editor.setReadOnly(false);
    window.editor.setSelection(5);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Change', exact: true }).dispatchEvent('click');
  expect(await page.evaluate(() => window.editor.getPlugin('test-ui-counts'))).toEqual({ mutations: 0, panels: 1 });
  expect(await html(page)).toBe('<p>Hello world</p>');
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
});

test('external replacement rejects a stale formatting target until a fresh editor selection', async ({ page }) => {
  await initialize(page);
  await page.getByLabel('Block format', { exact: true }).focus();
  await page.evaluate(() => window.editor.setHTML('<p>External</p>'));
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  expect(await html(page)).toBe('<p>External</p>');
  await expect(page.locator('.mw-ui-status')).toHaveText('Select text or place the caret in the editor first.');
  await page.evaluate(() => window.editor.setSelection(0, 8));
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(page.locator('.mw-content strong')).toHaveText('External');
});

test('Escape after external replacement focuses a safe new-document caret without editing or history', async ({ page }) => {
  await initialize(page);
  await page.getByLabel('Block format', { exact: true }).focus();
  await page.evaluate(() => window.editor.setHTML('<p>X</p>'));
  await page.keyboard.press('Escape');
  await expect(page.locator('.mw-content')).toBeFocused();
  const result = await page.evaluate(() => {
    const range = document.getSelection()?.getRangeAt(0);
    return {
      html: window.editor.getHTML(),
      selection: window.editor.getSelection(),
      currentTarget: Boolean(range && window.editor.surface.contains(range.commonAncestorContainer)),
      canUndo: window.editor.canUndo(),
      canRedo: window.editor.canRedo(),
    };
  });
  expect(result.html).toBe('<p>X</p>');
  expect(result.selection).toMatchObject({ length: 0 });
  expect(result.selection?.index).toBeGreaterThanOrEqual(0);
  expect(result.selection?.index).toBeLessThanOrEqual(1);
  expect(result.currentTarget).toBe(true);
  expect(result.canUndo).toBe(false);
  expect(result.canRedo).toBe(false);
});

test('locale and custom labels remain text and errors never expose original diagnostics', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    window.editor.getPlugin<EditorUIController>('test-editor-ui')!.destroy();
    const module = window.editor.getPlugin<typeof import('@morfira-dev/wysiwyg/ui/editor')>('test-editor-ui-module')!;
    const host = window.editor.getPlugin<HTMLElement>('test-editor-ui-host')!;
    const errors: unknown[] = [];
    window.editor.providePlugin('test-ui-errors', errors);
    module.createEditorUI(host, window.editor, { groups: [['bold', { id: 'fail', label: (editor) => editor.getLocale().locale === 'ru' ? 'Ошибка' : 'Fail', run: () => { throw new Error('PRIVATE diagnostic'); } }]], onError: (error) => { errors.push(error); throw new Error('diagnostic callback failed'); } });
    window.editor.setLocale('ru', { 'ui.editor.bold': '<img src=x onerror=alert(1)>' });
  });
  await expect(page.getByRole('button', { name: '<img src=x onerror=alert(1)>', exact: true })).toHaveCount(1);
  await expect(page.locator('.mw-editor-ui img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ошибка', exact: true }).click();
  await expect(page.locator('.mw-ui-status')).toHaveText('Не удалось выполнить действие. Проверьте выделение и повторите попытку.');
  await expect(page.locator('.mw-editor-ui')).not.toContainText('PRIVATE');
  expect(await page.evaluate(() => window.editor.getPlugin<unknown[]>('test-ui-errors')!.length)).toBe(1);
});

test('setup rejection preserves the host and destruction makes detached controls inert', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const module = window.editor.getPlugin<typeof import('@morfira-dev/wysiwyg/ui/editor')>('test-editor-ui-module')!;
    const host = document.createElement('div');
    host.textContent = 'Application';
    document.body.append(host);
    let rejected = 0;
    try { module.createEditorUI(host, window.editor); } catch { rejected++; }
    const empty = document.createElement('div');
    document.body.append(empty);
    try { module.createEditorUI(empty, window.editor, { groups: [['bold', 'bold']] }); } catch { rejected++; }
    const ui = window.editor.getPlugin<EditorUIController>('test-editor-ui')!;
    const button = ui.element.querySelector<HTMLButtonElement>('[data-mw-ui-action=bold]')!;
    ui.destroy();
    ui.destroy();
    button.click();
    let stale = false;
    try { ui.refresh(); } catch { stale = true; }
    return { rejected, preserved: host.textContent, empty: empty.innerHTML, html: window.editor.getHTML(), stale };
  });
  expect(result).toEqual({ rejected: 2, preserved: 'Application', empty: '', html: '<p>Hello world</p>', stale: true });
});

test('wrapped controls fit a narrow host and editor destruction releases associated UI', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    const ui = window.editor.getPlugin<EditorUIController>('test-editor-ui')!;
    ui.element.parentElement!.style.width = '280px';
  });
  await expect.poll(() => page.locator('.mw-editor-ui').evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
  await page.evaluate(() => window.editor.destroy());
  await expect(page.locator('.mw-editor-ui')).toHaveCount(0);
});

test('public shell import and default group creation are server-safe without browser globals', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '--eval', "const ui=await import('@morfira-dev/wysiwyg/ui/editor'); const a=ui.createDefaultEditorUIGroups(); const b=ui.createDefaultEditorUIGroups(); a[0].push('bold'); process.stdout.write(JSON.stringify([typeof ui.createEditorUI,b[0].length,typeof document]));"], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual(['function', 2, 'undefined']);
});
