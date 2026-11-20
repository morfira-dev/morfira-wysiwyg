import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { StandardEditorUIController } from '@morfira-dev/wysiwyg/ui/standard';
import './ui-images.types.js';

const initialize = async (page: Page, html = '<p>A<strong>word</strong>Z</p>', index = 1, length = 4, presentation?: 'inline' | 'floating') => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ html, index, length, presentation }) => {
    window.dispose();
    const editorHost = document.createElement('div');
    editorHost.className = 'standard-editor';
    const uiHost = document.createElement('div');
    uiHost.className = 'standard-ui-host';
    const outside = document.createElement('input');
    outside.type = 'text';
    outside.setAttribute('aria-label', 'Outside target');
    document.body.append(uiHost, editorHost, outside);
    window.changes = [];
    window.imageFormSignals = [];
    window.imageFormCompleters = [];
    window.imageFormExternalOutcome = undefined;
    const errors: unknown[] = [];
    window.editor = window.createEditor(editorHost, {
      value: html, locale: 'en',
      plugins: [window.createTables(), window.createImages({ upload: (_file, context) => {
        window.imageFormSignals.push(context.signal);
        return new Promise((resolve) => window.imageFormCompleters.push(resolve));
      } }), window.createSearch()],
      onChange: (change) => window.changes.push(change),
    });
    window.editor.setSelection(index, length);
    const modulePath = '/packages/plugins/dist/ui/standard.js';
    const { createStandardEditorUI } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/ui/standard');
    const ui = createStandardEditorUI(uiHost, window.editor, {
      presentation,
      images: { initialValues: { src: '/logo.svg' } },
      search: { initialValues: { query: 'word', replacement: 'term' } },
      onError: (error) => errors.push(error),
    });
    window.editor.providePlugin('test-standard-ui', ui);
    window.editor.providePlugin('test-standard-errors', errors);
  }, { html, index, length, presentation });
};
const content = (page: Page) => page.locator('.standard-editor .mw-content');
const tools = (page: Page) => page.locator('.standard-ui-host');
const launcher = (page: Page, id: string) => tools(page).locator(`[data-mw-ui-action="${id}"]`);
const panel = (page: Page) => tools(page).locator('.mw-ui-panel');
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

test('floating ready link popover preserves the selected target without shifting the editor', async ({ page }) => {
  await initialize(page, undefined, undefined, undefined, 'floating');
  await page.addStyleTag({ url: '/packages/plugins/dist/ui/editor.css' });
  const before = await content(page).boundingBox();
  await launcher(page, 'link').click();
  await expect(panel(page)).toHaveClass(/mw-ui-panel-popover/);
  expect((await content(page).boundingBox())?.y).toBe(before?.y);
  await panel(page).getByLabel('Link URL', { exact: true }).fill('https://example.com/selected');
  await panel(page).getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(content(page).locator('a')).toHaveText('word');
  await expect(content(page).locator('strong')).toHaveText('word');
  await panel(page).getByLabel('Link URL', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page, 'link')).toBeFocused();
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>A<strong>word</strong>Z</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.setSelection(1, 4));
  await launcher(page, 'link').click();
  await page.getByLabel('Outside target', { exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByLabel('Outside target', { exact: true })).toBeFocused();
});

test('floating ready search stays docked and leaves the editor available through navigation and replacement', async ({ page }) => {
  await initialize(page, '<p>word word</p>', 0, 0, 'floating');
  await page.addStyleTag({ url: '/packages/plugins/dist/ui/editor.css' });
  await launcher(page, 'search').click();
  await expect(panel(page)).toHaveClass(/mw-ui-search-docked/);
  await expect(tools(page).locator('dialog')).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Find', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Match 1 of 2');
  await panel(page).getByRole('button', { name: 'Next match', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Match 2 of 2');
  await content(page).click();
  await expect(content(page)).toBeFocused();
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(content(page)).toHaveText('word word!');
  await expect(panel(page)).toBeVisible();
  await page.evaluate(() => window.editor.undo());
  await panel(page).getByRole('button', { name: 'Replace all', exact: true }).click();
  await expect(content(page)).toHaveText('term term');
  await expect(panel(page)).toBeVisible();
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>word word</p>');
  await panel(page).getByLabel('Find text', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page, 'search')).toBeFocused();
});

test('standard preset exposes a localized keyboard horizontal-rule action with guarded one-step history', async ({ page }) => {
  await initialize(page, '<p>AB</p>', 1, 0);
  await expect(launcher(page, 'horizontal-rule')).toHaveCount(0);
  await page.evaluate(async () => {
    window.editor.getPlugin<StandardEditorUIController>('test-standard-ui')!.destroy();
    window.editor.destroy();
    const presetPath = '/packages/plugins/dist/presets/standard.js';
    const uiPath = '/packages/plugins/dist/ui/standard.js';
    const { createStandardPreset } = await import(/* @vite-ignore */ presetPath) as typeof import('@morfira-dev/wysiwyg/presets/standard');
    const { createStandardEditorUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/standard');
    window.editor = window.createEditor(document.querySelector<HTMLElement>('.standard-editor')!, createStandardPreset({ value: '<p>AB</p>', locale: 'en' }));
    window.editor.setSelection(1);
    const ui = createStandardEditorUI(document.querySelector<HTMLElement>('.standard-ui-host')!, window.editor);
    window.dispose = () => { ui.destroy(); window.editor.destroy(); };
  });
  await expect(launcher(page, 'horizontal-rule')).toHaveAccessibleName('Horizontal rule');
  await launcher(page, 'horizontal-rule').focus();
  await page.keyboard.press('Enter');
  expect(await html(page)).toBe('<p>A</p><hr><p>B</p>');
  await expect(content(page)).toBeFocused();
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>AB</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(launcher(page, 'horizontal-rule')).toHaveAccessibleName('Разделитель');
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(launcher(page, 'horizontal-rule')).toBeDisabled();
  expect(await html(page)).toBe('<p>AB</p>');
  await page.evaluate(() => {
    const editor = window.editor;
    editor.setReadOnly(false);
    editor.setSelection(1);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    // Authoritative external replacement cancels composition without requiring
    // a later browser compositionend to release the visible command guard.
    editor.setHTML('<p>New</p>');
    editor.setSelection(1);
  });
  await expect(launcher(page, 'horizontal-rule')).toBeEnabled();
  await launcher(page, 'horizontal-rule').click();
  expect(await html(page)).toBe('<p>N</p><hr><p>ew</p>');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>New</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => {
    const editor = window.editor;
    editor.setSelection(1);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    editor.setReadOnly(true);
    editor.setReadOnly(false);
    editor.setSelection(1);
  });
  await expect(launcher(page, 'horizontal-rule')).toBeEnabled();
  expect(await html(page)).toBe('<p>New</p>');
});

test('link popup preserves a rich backwards selection through field focus and one-step history', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 4, text, 0);
  });
  await launcher(page, 'link').click();
  await expect(launcher(page, 'link')).toHaveAttribute('aria-expanded', 'true');
  await expect(panel(page).getByLabel('Link URL', { exact: true })).toBeFocused();
  await panel(page).getByLabel('Link URL', { exact: true }).fill('https://example.com/article');
  await panel(page).getByLabel('Link title', { exact: true }).fill('Article');
  await panel(page).getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(content(page).locator('a')).toHaveText('word');
  await expect(content(page).locator('a')).toHaveAttribute('title', 'Article');
  await expect(content(page).locator('strong')).toHaveText('word');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>A<strong>word</strong>Z</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo());
  await expect(content(page).locator('a')).toHaveAttribute('href', 'https://example.com/article');
});

test('image form opens at the chosen empty block and inserts outside the preceding rich block', async ({ page }) => {
  await initialize(page, '<p>Before</p><p><br></p>', 0, 0);
  await page.evaluate(() => {
    const block = window.editor.surface.querySelectorAll('p')[1];
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(true);
    window.editor.surface.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  });
  await launcher(page, 'image').click();
  await panel(page).getByLabel('Alt', { exact: true }).fill('A <literal> image');
  await panel(page).getByRole('button', { name: 'Insert image', exact: true }).click();
  await expect(content(page).locator('p').first()).toHaveText('Before');
  await expect(content(page).locator('img')).toHaveAttribute('src', '/logo.svg');
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'A <literal> image');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>Before</p><p><br></p>');
});

test('search stays usable read-only and replacement retains the shared one-step history', async ({ page }) => {
  await initialize(page, '<p>word word</p>', 0, 0);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await launcher(page, 'search').click();
  await panel(page).getByRole('button', { name: 'Find', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Match 1 of 2');
  await panel(page).getByRole('button', { name: 'Next match', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Match 2 of 2');
  await expect(panel(page).getByRole('button', { name: 'Replace all', exact: true })).toBeDisabled();
  expect(await html(page)).toBe('<p>word word</p>');
  await page.evaluate(() => window.editor.setReadOnly(false));
  await panel(page).getByRole('button', { name: 'Replace all', exact: true }).click();
  await expect(content(page)).toHaveText('term term');
  await page.evaluate(() => window.editor.undo());
  await expect(content(page)).toHaveText('word word');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('table panel validates dimensions and commits one insertion with undo and caret focus', async ({ page }) => {
  await initialize(page, '<p><br></p>', 0, 0);
  await launcher(page, 'table').click();
  const form = panel(page).getByRole('form', { name: 'Insert table', exact: true });
  await form.getByLabel('Table rows', { exact: true }).fill('0');
  await form.getByRole('button', { name: 'Insert table', exact: true }).click();
  await expect(content(page).locator('table')).toHaveCount(0);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await expect(tools(page).locator(':scope > .mw-standard-editor-ui > .mw-ui-status')).toContainText('Unable to apply');
  await form.getByLabel('Table rows', { exact: true }).fill('2');
  await form.getByLabel('Table columns', { exact: true }).fill('3');
  await form.getByRole('button', { name: 'Insert table', exact: true }).click();
  await expect(content(page).locator('tr')).toHaveCount(2);
  await expect(content(page).locator('td')).toHaveCount(6);
  await expect(panel(page)).toBeHidden();
  await expect(content(page)).toBeFocused();
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p><br></p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('nested table rejection preserves a merged source cell, content and history atomically', async ({ page }) => {
  await initialize(page, '<table><tbody><tr><td rowspan="2"><p>One</p></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><p>Tail</p>', 0, 0);
  const before = await html(page);
  await content(page).locator('td p').click();
  await launcher(page, 'table').click();
  await panel(page).getByRole('form', { name: 'Insert table', exact: true }).getByRole('button', { name: 'Insert table', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(content(page).locator('td[rowspan="2"]')).toHaveText('One');
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  expect(await page.evaluate(() => window.editor.getPlugin<unknown[]>('test-standard-errors')!.length)).toBe(1);
});

test('Escape and outside interaction close only the popup, preserve drafts and return focus appropriately', async ({ page }) => {
  await initialize(page);
  const before = await html(page);
  await launcher(page, 'link').click();
  await panel(page).getByLabel('Link URL', { exact: true }).fill('https://draft.example');
  await panel(page).getByLabel('Link title', { exact: true }).fill('Unsubmitted draft');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page, 'link')).toBeFocused();
  await expect(launcher(page, 'link')).toHaveAttribute('aria-expanded', 'false');
  await launcher(page, 'link').click();
  await expect(panel(page).getByLabel('Link URL', { exact: true })).toHaveValue('https://draft.example');
  await page.getByRole('textbox', { name: 'Outside target', exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Outside target', exact: true })).toBeFocused();
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('external replacement closes old panels and rejects stale targets until the editor receives a fresh selection', async ({ page }) => {
  await initialize(page);
  await launcher(page, 'link').click();
  await panel(page).getByLabel('Link URL', { exact: true }).fill('https://stale.example');
  await page.evaluate(() => window.editor.setHTML('<p>Replacement</p>'));
  await expect(panel(page)).toBeHidden();
  await launcher(page, 'link').click();
  await expect(panel(page)).toBeHidden();
  await expect(tools(page).locator(':scope > .mw-standard-editor-ui > .mw-ui-status')).toHaveText('Select text or place the caret in the editor first.');
  await page.evaluate(() => window.editor.setSelection(0, 11));
  await launcher(page, 'link').click();
  await expect(panel(page).getByLabel('Link URL', { exact: true })).toHaveValue('');
  await panel(page).getByLabel('Link URL', { exact: true }).fill('https://fresh.example');
  await panel(page).getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(content(page).locator('a')).toHaveText('Replacement');
  await expect(content(page).locator('a')).toHaveAttribute('href', 'https://fresh.example');
});

test('live locale and overrides update open forms safely without changing document or drafts', async ({ page }) => {
  await initialize(page);
  const before = await html(page);
  await launcher(page, 'link').click();
  await panel(page).getByLabel('Link title', { exact: true }).fill('Draft title');
  await page.evaluate(() => window.editor.setLocale('ru', { 'ui.standard.link': '<img src=x onerror=alert(1)>' }));
  await expect(launcher(page, 'link')).toHaveAttribute('aria-label', '<img src=x onerror=alert(1)>');
  await expect(panel(page).getByLabel('Заголовок ссылки', { exact: true })).toHaveValue('Draft title');
  await expect(panel(page).getByRole('button', { name: 'Закрыть панель', exact: true })).toBeVisible();
  await expect(tools(page).locator('img')).toHaveCount(0);
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('closing an upload panel cancels only its own request and leaves an application upload active', async ({ page }) => {
  await initialize(page, '<p>abcd</p>', 2, 0);
  await launcher(page, 'image').click();
  await panel(page).getByLabel('Image file', { exact: true }).setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: Buffer.from('png') });
  await expect.poll(() => page.evaluate(() => window.imageFormSignals.length)).toBe(1);
  await page.evaluate(() => {
    window.editor.setSelection(2);
    void window.imageCommands(window.editor).upload(new File(['png'], 'external.png', { type: 'image/png' })).then((ok) => window.imageFormExternalOutcome = ok);
  });
  await expect.poll(() => page.evaluate(() => window.imageFormSignals.length)).toBe(2);
  await panel(page).getByRole('button', { name: 'Close panel', exact: true }).click();
  expect(await page.evaluate(() => window.imageFormSignals.map((signal) => signal.aborted))).toEqual([true, false]);
  await page.evaluate(() => window.imageFormCompleters[1]({ src: '/logo.svg', alt: 'Application request' }));
  await expect(content(page).locator('img')).toHaveAttribute('alt', 'Application request');
  expect(await page.evaluate(() => window.imageFormExternalOutcome)).toBe(true);
});

test('popup IDs remain unique for detached instances without crypto.randomUUID', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window.crypto, 'randomUUID');
    const modulePath = '/packages/plugins/dist/ui/standard.js';
    const { createStandardEditorUI } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/ui/standard');
    const reserved = document.createElement('div');
    reserved.id = 'mw-ui-panel-2';
    document.body.append(reserved);
    const instances: StandardEditorUIController[] = [];
    const hosts = [document.createElement('div'), document.createElement('div')];
    try {
      Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: undefined });
      for (const host of hosts) instances.push(createStandardEditorUI(host, window.editor));
      document.body.append(...hosts);
      const first = window.editor.getPlugin<StandardEditorUIController>('test-standard-ui')!;
      const roots = [first.element, ...instances.map((instance) => instance.element)];
      const ids = roots.flatMap((root) => Array.from(root.querySelectorAll('[id]'), (node) => node.id));
      const referencesValid = roots.every((root) => {
        const region = root.querySelector('.mw-ui-panel')!;
        return region.id !== reserved.id
          && root.querySelector('h3')?.id === region.getAttribute('aria-labelledby')
          && Array.from(root.querySelectorAll('[aria-controls]')).every((launcher) => launcher.getAttribute('aria-controls') === region.id);
      });
      return { ids, referencesValid, html: window.editor.getHTML(), canUndo: window.editor.canUndo() };
    } finally {
      if (descriptor) Object.defineProperty(window.crypto, 'randomUUID', descriptor);
      else Reflect.deleteProperty(window.crypto, 'randomUUID');
      for (const instance of instances) instance.destroy();
      for (const host of hosts) host.remove();
      reserved.remove();
    }
  });
  expect(result.ids).toHaveLength(6);
  expect(new Set(result.ids).size).toBe(6);
  expect(result.referencesValid).toBe(true);
  expect(result.html).toBe('<p>A<strong>word</strong>Z</p>');
  expect(result.canUndo).toBe(false);
});

test('instances use unique popup IDs and destruction leaves the editor usable with inert detached controls', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/plugins/dist/ui/standard.js';
    const { createStandardEditorUI } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/ui/standard');
    const secondHost = document.createElement('div');
    document.body.append(secondHost);
    const second = createStandardEditorUI(secondHost, window.editor);
    const first = window.editor.getPlugin<StandardEditorUIController>('test-standard-ui')!;
    const ids = [first.element.querySelector('.mw-ui-panel')!.id, second.element.querySelector('.mw-ui-panel')!.id];
    const old = first.element;
    first.destroy();
    first.destroy();
    (old.querySelector('[data-mw-ui-action="bold"]') as HTMLButtonElement | null)?.click();
    let stale = false;
    try { first.refresh(); } catch { stale = true; }
    const secondAlive = second.element.isConnected;
    window.editor.setSelection(1);
    window.editor.insertHTML('!');
    const value = window.editor.getHTML();
    window.editor.destroy();
    return { ids, stale, secondAlive, value, removed: !second.element.isConnected };
  });
  expect(new Set(result.ids).size).toBe(2);
  expect(result.stale).toBe(true);
  expect(result.secondAlive).toBe(true);
  expect(result.value).toContain('!');
  expect(result.removed).toBe(true);
});

test('missing required behavior and invalid hosts fail before changing host contents', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/packages/plugins/dist/ui/standard.js';
    const { createStandardEditorUI } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/ui/standard');
    window.dispose();
    const editorHost = document.createElement('div');
    const host = document.createElement('div');
    document.body.append(editorHost, host);
    const editor = window.createEditor(editorHost);
    const failures: boolean[] = [];
    try { createStandardEditorUI(host, editor); } catch { failures.push(host.childNodes.length === 0); }
    host.textContent = 'Application content';
    try { createStandardEditorUI(host, editor); } catch { failures.push(host.textContent === 'Application content'); }
    const inside = document.createElement('div');
    editor.surface.append(inside);
    try { createStandardEditorUI(inside, editor); } catch { failures.push(!inside.childNodes.length); }
    editor.destroy();
    return failures;
  });
  expect(result).toEqual([true, true, true]);
});

test('standard UI imports on the server without browser globals, framework or registration', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', "import { createStandardEditorUI } from '@morfira-dev/wysiwyg/ui/standard'; console.log(typeof createStandardEditorUI, typeof document, typeof customElements)"], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  expect(output).toBe('function undefined undefined');
});

test('composition disables mutation launchers and synthetic table activation cannot edit', async ({ page }) => {
  await initialize(page, '<p>word</p>', 4, 0);
  const before = await html(page);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await expect(launcher(page, 'table')).toBeDisabled();
  await page.evaluate(() => document.querySelector('[data-mw-ui-action="table"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await expect(panel(page)).toBeHidden();
  expect(await html(page)).toBe(before);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await expect(launcher(page, 'table')).toBeEnabled();
});

test('table chooser embeds inside an application form without nested forms or accidental submission', async ({ page }) => {
  await initialize(page, '<p><br></p>', 0, 0);
  await page.evaluate(() => {
    const host = document.querySelector('.standard-ui-host')!;
    const application = document.createElement('form');
    document.body.append(application);
    application.append(host);
    application.dataset.submissions = '0';
    application.addEventListener('submit', (event) => {
      event.preventDefault();
      application.dataset.submissions = String(Number(application.dataset.submissions) + 1);
    });
  });
  await launcher(page, 'table').click();
  await panel(page).getByLabel('Table rows', { exact: true }).fill('2');
  await panel(page).getByLabel('Table columns', { exact: true }).fill('2');
  await panel(page).getByLabel('Table columns', { exact: true }).press('Enter');
  await expect(content(page).locator('td')).toHaveCount(4);
  await expect(page.locator('form form')).toHaveCount(0);
  await expect(page.locator('form[data-submissions]')).toHaveAttribute('data-submissions', '0');
});
