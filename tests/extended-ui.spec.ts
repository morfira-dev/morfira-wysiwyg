import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ExtendedEditorUIController } from '@morfira-dev/wysiwyg/ui/extended';

const initialize = async (page: Page, mount = true) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (mount) => {
    window.dispose();
    const presetPath = '/packages/plugins/dist/presets/extended.js';
    const { createExtendedPreset } = await import(/* @vite-ignore */ presetPath) as typeof import('@morfira-dev/wysiwyg/presets/extended');
    const uiPath = '/packages/plugins/dist/ui/extended.js';
    const { createExtendedEditorUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/extended');
    const host = document.createElement('div');
    host.className = 'extended-editor';
    const uiHost = document.createElement('div');
    uiHost.className = 'extended-ui-host';
    document.body.append(uiHost, host);
    window.changes = [];
    window.editor = window.createEditor(host, createExtendedPreset({
      value: '<p><br></p>', locale: 'en',
      mentions: { provide: () => [{ id: 'alice', label: 'Alice <literal>' }], debounceMs: 0 },
      slash: { provide: () => [{ id: 'heading', label: 'Heading 2', action: 'heading2' }], debounceMs: 0 },
      onChange: (change) => window.changes.push(change),
    }));
    if (mount) window.editor.providePlugin('test-extended-ui', createExtendedEditorUI(uiHost, window.editor));
    window.editor.setSelection(0);
  }, mount);
};
const content = (page: Page) => page.locator('.extended-editor .mw-content');
const visibleMenu = (page: Page) => page.locator('.extended-editor .mw-suggestions:not([hidden])');

test('extended public imports are server-safe without touching DOM or registering globals', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    for (const key of ['document', 'window', 'customElements']) Object.defineProperty(globalThis, key, { get: () => { throw new Error('DOM accessed'); } });
    globalThis.fetch = () => { throw new Error('Network accessed'); };
    const { createExtendedEditorUI } = await import('@morfira-dev/wysiwyg/ui/extended');
    const { createExtendedPreset } = await import('@morfira-dev/wysiwyg/presets/extended');
    const provide = () => { throw new Error('Provider invoked'); };
    console.log(JSON.stringify({ factory: typeof createExtendedEditorUI, plugins: createExtendedPreset({ mentions: { provide }, slash: { provide } }).plugins.length }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(result)).toEqual({ factory: 'function', plugins: 8 });
});

test('native mention typing and pointer choice insert literal text with one completion undo', async ({ page }) => {
  await initialize(page);
  await page.keyboard.type('@a');
  await expect(visibleMenu(page).getByRole('option')).toHaveText('Alice <literal>');
  const before = await page.evaluate(() => window.editor.getHTML());
  await visibleMenu(page).getByRole('option').click();
  await expect(content(page)).toHaveText('@Alice <literal> ');
  await expect(content(page).locator('literal')).toHaveCount(0);
  await expect(content(page)).toBeFocused();
  await expect(visibleMenu(page)).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => window.editor.redo());
  await expect(content(page)).toHaveText('@Alice <literal> ');
  await page.keyboard.type('Z');
  await expect(content(page)).toHaveText('@Alice <literal> Z');
});

test('native slash command uses preset structural actions and restores trigger on undo', async ({ page }) => {
  await initialize(page);
  await page.keyboard.type('/h');
  await expect(visibleMenu(page).getByRole('option')).toHaveText('Heading 2');
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.keyboard.press('Enter');
  await expect(content(page).locator('h2')).toHaveCount(1);
  await expect(content(page)).toHaveText('');
  await expect(visibleMenu(page)).toHaveCount(0);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('Title');
  await expect(content(page).locator('h2')).toHaveText('Title');
});

test('missing behavior is rejected before changing the application UI host', async ({ page }) => {
  await initialize(page, false);
  const outcomes = await page.evaluate(async () => {
    const uiPath = '/packages/plugins/dist/ui/extended.js';
    const { createExtendedEditorUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/extended');
    const presetPath = '/packages/plugins/dist/presets/extended.js';
    const { createExtendedPreset } = await import(/* @vite-ignore */ presetPath) as typeof import('@morfira-dev/wysiwyg/presets/extended');
    const uiHost = document.querySelector<HTMLElement>('.extended-ui-host')!;
    const before = uiHost.innerHTML;
    return ['mentions', 'slash', 'tables', 'images', 'search'].map((missing) => {
      const host = document.createElement('div');
      document.body.append(host);
      const options = createExtendedPreset({ mentions: { provide: () => [] }, slash: { provide: () => [] } });
      options.plugins = options.plugins!.filter((plugin) => plugin.name !== missing);
      const editor = window.createEditor(host, options);
      let rejected = false;
      try { createExtendedEditorUI(uiHost, editor); }
      catch { rejected = true; }
      const result = { missing, rejected, unchanged: uiHost.innerHTML === before, menus: host.querySelectorAll('.mw-suggestions').length };
      editor.destroy();
      host.remove();
      return result;
    });
  });
  for (const outcome of outcomes) expect(outcome).toEqual({ missing: outcome.missing, rejected: true, unchanged: true, menus: 0 });
});

test('nonempty application UI host is rejected without changing its existing content', async ({ page }) => {
  await initialize(page, false);
  const result = await page.evaluate(async () => {
    const uiPath = '/packages/plugins/dist/ui/extended.js';
    const { createExtendedEditorUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/extended');
    const host = document.querySelector<HTMLElement>('.extended-ui-host')!;
    const marker = document.createElement('span');
    marker.textContent = 'Application content';
    host.append(marker);
    const before = host.innerHTML;
    let rejected = false;
    try { createExtendedEditorUI(host, window.editor); }
    catch { rejected = true; }
    return { rejected, unchanged: host.innerHTML === before, sameChild: host.firstChild === marker, menus: window.editor.element.querySelectorAll('.mw-suggestions').length };
  });
  expect(result).toEqual({ rejected: true, unchanged: true, sameChild: true, menus: 0 });
});

for (const existing of ['mentions', 'slash'] as const) {
  test(`duplicate ${existing} view preserves external ownership and rolls back newly mounted UI`, async ({ page }) => {
    await initialize(page, false);
    const result = await page.evaluate(async (existing) => {
      const uiPath = '/packages/plugins/dist/ui/extended.js';
      const { createExtendedEditorUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/extended');
      const host = document.querySelector<HTMLElement>('.extended-ui-host')!;
      const before = host.innerHTML;
      const dispose = existing === 'mentions'
        ? window.createSuggestionMenu(window.editor, window.mentionCommands(window.editor))
        : window.createSuggestionMenu(window.editor, window.slashCommands(window.editor));
      const external = window.editor.element.querySelector('.mw-suggestions');
      const controls = window.editor.surface.getAttribute('aria-controls');
      let rejected = false;
      try { createExtendedEditorUI(host, window.editor); }
      catch { rejected = true; }
      const result = { rejected, unchanged: host.innerHTML === before, sameMenu: window.editor.element.querySelector('.mw-suggestions') === external, menus: window.editor.element.querySelectorAll('.mw-suggestions').length, controls: window.editor.surface.getAttribute('aria-controls') === controls };
      dispose();
      const remounted = createExtendedEditorUI(host, window.editor);
      remounted.destroy();
      return { ...result, released: window.editor.element.querySelectorAll('.mw-suggestions').length === 0, hostRestored: host.innerHTML === before, childCount: host.childElementCount };
    }, existing);
    expect(result).toEqual({ rejected: true, unchanged: true, sameMenu: true, menus: 1, controls: true, released: true, hostRestored: true, childCount: 0 });
  });
}

test('two editors own independent views and explicit or editor disposal removes only owned DOM', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(async () => {
    const uiPath = '/packages/plugins/dist/ui/extended.js';
    const { createExtendedEditorUI } = await import(/* @vite-ignore */ uiPath) as typeof import('@morfira-dev/wysiwyg/ui/extended');
    const presetPath = '/packages/plugins/dist/presets/extended.js';
    const { createExtendedPreset } = await import(/* @vite-ignore */ presetPath) as typeof import('@morfira-dev/wysiwyg/presets/extended');
    const first = window.editor.getPlugin<ExtendedEditorUIController>('test-extended-ui')!;
    const editorHost = document.createElement('div');
    const uiHost = document.createElement('div');
    document.body.append(uiHost, editorHost);
    const editor = window.createEditor(editorHost, createExtendedPreset({ mentions: { provide: () => [] }, slash: { provide: () => [] } }));
    const second = createExtendedEditorUI(uiHost, editor);
    const mountedOutsideEditor = !window.editor.element.contains(first.element) && document.querySelector('.extended-ui-host')!.contains(first.element);
    first.destroy();
    first.destroy();
    let firstStale = false;
    try { first.refresh(); } catch { firstStale = true; }
    const afterFirst = { firstMenus: window.editor.element.querySelectorAll('.mw-suggestions').length, firstHost: document.querySelector('.extended-ui-host')!.textContent, secondMenus: editor.element.querySelectorAll('.mw-suggestions').length, secondUI: second.element.isConnected, firstAlive: window.editor.getHTML() === '<p><br></p>' };
    second.refresh();
    editor.destroy();
    second.destroy();
    let secondStale = false;
    try { second.refresh(); } catch { secondStale = true; }
    return { mountedOutsideEditor, firstStale, secondStale, afterFirst, secondRemoved: !second.element.isConnected, secondHost: uiHost.textContent, menusRemaining: document.querySelectorAll('.mw-suggestions').length };
  });
  expect(result).toEqual({ mountedOutsideEditor: true, firstStale: true, secondStale: true, afterFirst: { firstMenus: 0, firstHost: '', secondMenus: 2, secondUI: true, firstAlive: true }, secondRemoved: true, secondHost: '', menusRemaining: 0 });
});
