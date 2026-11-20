import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SpecialCharacterTestOptions } from './special-characters.types.js';
import './special-characters.types.js';

const characters = [{ id: 'euro', text: '€', label: 'Currency euro' }, { id: 'literal', text: '<b>&', label: '<img src=x>' }];
const panel = (page: Page) => page.locator('.character-panel-host');
const content = (page: Page) => page.locator('.character-editor .mw-content');
const character = (page: Page, id = 'euro') => panel(page).locator(`[data-mw-character="${id}"]`);
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

const initialize = async (page: Page, options: SpecialCharacterTestOptions = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ value, characters, semantic, tables }) => {
    window.dispose();
    await Promise.all(['core/dist/style.css', 'plugins/dist/ui/special-characters.css'].map((path) => new Promise<void>((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/packages/' + path;
      css.onload = () => resolve();
      css.onerror = () => reject(new Error(`Could not load ${path}`));
      document.head.append(css);
    })));
    const mount = document.createElement('div');
    mount.className = 'character-editor';
    const host = document.createElement('div');
    host.className = 'character-panel-host';
    document.body.prepend(mount, host);
    window.changes = [];
    window.editor = window.createEditor(mount, {
      value, locale: 'en',
      plugins: tables ? [window.createTables()] : [],
      schema: semantic ? [{ name: 'test:protected', kind: 'inline', tag: 'span' }] : [],
      onChange: (change) => window.changes.push(change),
    });
    window.editor.setSelection(1);
    const path = '/packages/wysiwyg/dist/ui/special-characters.js';
    window.specialCharacterModule = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/special-characters');
    window.specialCharacterUI = window.specialCharacterModule.createSpecialCharacterUI(host, window.editor, { characters });
    window.dispose = () => { window.specialCharacterUI.destroy(); window.editor.destroy(); mount.remove(); host.remove(); };
  }, { value: options.value ?? '<p>XY</p>', characters: options.characters ?? characters, semantic: options.semantic ?? false, tables: options.tables ?? false });
};

const caret = (page: Page, selector: string, offset: number) => page.evaluate(({ selector, offset }) => {
  window.editor.focus();
  const text = window.editor.surface.querySelector(selector)!.firstChild!;
  document.getSelection()!.setBaseAndExtent(text, offset, text, offset);
  window.specialCharacterUI.refresh();
}, { selector, offset });

test('literal custom text replaces a backward marked range safely in one history step and an empty block remains editable', async ({ page }) => {
  const original = '<p>A <strong>word</strong> Z</p>';
  await initialize(page, { value: original });
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    window.editor.focus();
    document.getSelection()!.setBaseAndExtent(text, 4, text, 0);
    window.specialCharacterUI.refresh();
  });
  await character(page, 'literal').click();
  await expect(content(page)).toHaveText('A <b>& Z');
  await expect(content(page).locator('strong')).toHaveText('<b>&');
  await expect(content(page).locator('b,img')).toHaveCount(0);
  await expect(panel(page).locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => ({ changes: window.changes.filter((change) => change.source === 'user').length, selection: window.editor.getSelection() })))
    .toEqual({ changes: 1, selection: { index: 6, length: 0 } });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  expect(await page.evaluate(() => {
    const native = document.getSelection()!;
    return { text: native.toString(), backward: native.anchorOffset > native.focusOffset, selection: window.editor.getSelection(), undo: window.editor.canUndo() };
  })).toEqual({ text: 'word', backward: true, selection: { index: 2, length: 4 }, undo: false });
  await page.evaluate(() => {
    window.editor.setHTML('<p><br></p>');
    window.editor.setSelection(0);
    window.specialCharacterUI.refresh();
  });
  await character(page).click();
  await expect(content(page)).toHaveText('€');
  await page.keyboard.insertText('!');
  await expect(content(page)).toHaveText('€!');
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await html(page)).toBe('<p><br></p>');
});

test('ordinary list and merged-cell text use the current insertion point without replacing unrelated structure', async ({ page }) => {
  await initialize(page, { tables: true, value: '<ul><li><em>Item</em></li></ul><table><tr><td rowspan="2">Cell</td><td>A</td></tr><tr><td>B</td></tr></table>' });
  const original = await html(page);
  await caret(page, 'em', 2);
  await character(page).click();
  await expect(content(page).locator('em')).toHaveText('It€em');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  const cell = await content(page).locator('td').first().elementHandle();
  await caret(page, 'td', 1);
  await character(page).click();
  await expect(content(page).locator('td').first()).toHaveText('C€ell');
  await expect(content(page).locator('td').first()).toHaveAttribute('rowspan', '2');
  await expect(content(page).locator('li')).toHaveText('Item');
  expect(await cell!.evaluate((node) => node === window.editor.surface.querySelector('td'))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(original);
  await caret(page, 'td', 1);
  await page.evaluate(() => {
    window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 1, column: 1 });
    window.specialCharacterUI.refresh();
  });
  await expect(character(page)).toBeDisabled();
  await character(page).dispatchEvent('click');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: original, undo: false });
});

test('search and locale are observational while native button keyboard activation and Escape retain selection', async ({ page }) => {
  await initialize(page, { characters: Array.from({ length: 10 }, (_, index) => ({ id: `item-${index}`, text: String.fromCharCode(65 + index), label: `Item ${index}` })) });
  await character(page, 'item-0').focus();
  await page.keyboard.press('ArrowRight');
  await expect(character(page, 'item-1')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(character(page, 'item-9')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(character(page, 'item-8')).toBeFocused();
  await page.keyboard.press('End');
  await expect(character(page, 'item-9')).toBeFocused();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(content(page)).toHaveText('XBY');
  await page.evaluate(() => window.editor.undo());
  await panel(page).getByLabel('Find a symbol', { exact: true }).fill('Item 3');
  await expect(panel(page).getByRole('button')).toHaveCount(1);
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(panel(page).getByLabel('Найти символ', { exact: true })).toHaveValue('Item 3');
  await expect(panel(page).getByRole('status')).toHaveText('Найдено символов: 1');
  await panel(page).getByLabel('Найти символ', { exact: true }).fill('[missing]');
  await expect(panel(page).getByRole('status')).toHaveText('Символы не найдены.');
  await expect(panel(page).getByRole('button')).toHaveCount(0);
  await panel(page).getByLabel('Найти символ', { exact: true }).fill('');
  await character(page, 'item-0').focus();
  await page.keyboard.press('Control+End');
  await expect(character(page, 'item-9')).toBeFocused();
  await page.evaluate(() => window.editor.setLocale('en'));
  await expect(character(page, 'item-9')).toBeFocused();
  await expect(panel(page).locator('button[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(content(page)).toBeFocused();
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), selection: window.editor.getSelection() })))
    .toEqual({ html: '<p>XY</p>', undo: false, selection: { index: 1, length: 0 } });
});

test('readonly, composition and API replacement reject stale activation while fresh selection restores availability', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(character(page)).toBeDisabled();
  await character(page).dispatchEvent('click');
  await panel(page).getByLabel('Find a symbol', { exact: true }).fill('euro');
  expect(await html(page)).toBe('<p>XY</p>');
  await page.evaluate(() => {
    window.editor.setReadOnly(false);
    window.editor.setSelection(1);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  await expect(character(page)).toBeDisabled();
  await character(page).dispatchEvent('click');
  expect(await html(page)).toBe('<p>XY</p>');
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await panel(page).getByLabel('Find a symbol', { exact: true }).focus();
  const retained = await character(page).elementHandle();
  await page.evaluate(() => window.editor.setHTML('<p>Replacement</p>'));
  await retained!.evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await character(page).dispatchEvent('click');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: '<p>Replacement</p>', undo: false });
  await page.evaluate(() => { window.editor.setSelection(3); window.specialCharacterUI.refresh(); });
  await character(page).click();
  await expect(content(page)).toHaveText('Rep€lacement');
  await page.evaluate(() => {
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setHTML('<p>Recovered</p>');
    window.editor.setSelection(1);
    window.specialCharacterUI.refresh();
  });
  await character(page).click();
  await expect(content(page)).toHaveText('R€ecovered');
  await page.evaluate(() => {
    window.editor.undo();
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setReadOnly(true);
    window.editor.setReadOnly(false);
    window.editor.setSelection(2);
    window.specialCharacterUI.refresh();
  });
  await character(page).click();
  await expect(content(page)).toHaveText('Re€covered');
});

test('focus-time document replacement and same-document range retargeting cannot apply a character to a different target', async ({ page }) => {
  await initialize(page);
  await character(page).focus();
  expect(await page.evaluate(() => {
    const surface = window.editor.surface;
    const focus = surface.focus.bind(surface);
    let called = false;
    surface.focus = (options) => { surface.focus = focus; focus(options); called = true; window.editor.setHTML('<p>Replacement</p>'); };
    try { window.specialCharacterUI.element.querySelector<HTMLButtonElement>('[data-mw-character="euro"]')!.click(); }
    finally { surface.focus = focus; }
    return { called, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  })).toEqual({ called: true, html: '<p>Replacement</p>', undo: false });
  await page.evaluate(() => { window.editor.setSelection(1); window.specialCharacterUI.refresh(); });
  await character(page).focus();
  expect(await page.evaluate(() => {
    const surface = window.editor.surface;
    const focus = surface.focus.bind(surface);
    let called = false;
    surface.focus = (options) => { surface.focus = focus; focus(options); called = true; window.editor.setSelection(2); };
    try { window.specialCharacterUI.element.querySelector<HTMLButtonElement>('[data-mw-character="euro"]')!.click(); }
    finally { surface.focus = focus; }
    return { called, html: window.editor.getHTML(), undo: window.editor.canUndo(), selection: window.editor.getSelection() };
  })).toEqual({ called: true, html: '<p>Replacement</p>', undo: false, selection: { index: 2, length: 0 } });
});

test('owning semantic, selected resources, noneditable and foreign content refuse before any document mutation', async ({ page }) => {
  await initialize(page, { semantic: true, value: '<p>A<span data-mw-node="test:protected">token</span>B<img src="/logo.svg" alt="resource"></p><table><tr><td>Cell</td></tr></table>' });
  const results = await page.evaluate(() => {
    const root = window.editor.surface;
    const paragraph = root.querySelector('p')!;
    const noneditable = document.createElement('span');
    noneditable.contentEditable = 'false';
    noneditable.textContent = 'owned';
    paragraph.append(noneditable);
    const foreign = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    foreign.textContent = 'foreign';
    paragraph.append(foreign);
    const targets = [root.querySelector('[data-mw-node]')!, root.querySelector('img')!, root.querySelector('table')!, noneditable, foreign];
    return targets.map((target) => {
      root.focus();
      const range = document.createRange();
      if (target.localName === 'span' || target === foreign) { range.selectNodeContents(target); range.collapse(true); }
      else range.selectNode(target);
      const native = document.getSelection()!;
      native.removeAllRanges();
      native.addRange(range);
      window.specialCharacterUI.refresh();
      const before = root.innerHTML;
      window.specialCharacterUI.element.querySelector<HTMLButtonElement>('[data-mw-character="euro"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return { unchanged: root.innerHTML === before, undo: window.editor.canUndo() };
    });
  });
  expect(results).toEqual(Array.from({ length: 5 }, () => ({ unchanged: true, undo: false })));
});

test('malformed catalogs and hosts fail atomically and valid caller arrays are snapshotted', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const factory = window.specialCharacterModule.createSpecialCharacterUI;
    const host = document.createElement('div');
    document.body.append(host);
    const base = { id: 'valid', text: '€', label: 'Currency' };
    const invalid = [[], new Array<typeof base>(1), [base, base], [{ ...base, id: '' }], [{ ...base, id: 'x'.repeat(65) }],
      [{ ...base, text: '' }], [{ ...base, text: 'x'.repeat(17) }], [{ ...base, text: '\u202e' }],
      [{ ...base, text: '\ud800' }], [{ ...base, text: '\n' }], [{ ...base, label: 'x'.repeat(161) }],
      Array.from({ length: 257 }, (_, index) => ({ ...base, id: `id-${index}` }))];
    const rejected = invalid.map((characters) => {
      try { factory(host, window.editor, { characters }); return false; }
      catch { return host.childNodes.length === 0; }
    });
    host.append(document.createTextNode('Preserve host'));
    let hostRejected = false;
    try { factory(host, window.editor); } catch { hostRejected = host.textContent === 'Preserve host'; }
    let surfaceRejected = false;
    try { factory(window.editor.surface, window.editor); } catch { surfaceRejected = true; }
    host.replaceChildren();
    const characters = [{ ...base }];
    const ui = factory(host, window.editor, { characters });
    Object.assign(characters[0], { text: '<unsafe>', label: 'Changed' });
    characters.push({ id: 'extra', text: 'X', label: 'Extra' });
    ui.refresh();
    const snapshot = { count: ui.element.querySelectorAll('[data-mw-character]').length, text: ui.element.querySelector('[data-mw-character]')!.textContent };
    ui.destroy(); host.remove();
    return { rejected, hostRejected, surfaceRejected, snapshot, html: window.editor.getHTML(), undo: window.editor.canUndo() };
  });
  expect(result).toEqual({ rejected: Array(12).fill(true), hostRejected: true, surfaceRejected: true, snapshot: { count: 1, text: '€' }, html: '<p>XY</p>', undo: false });
});

test('controllers isolate state and stale controls stay inert after controller or editor disposal', async ({ page }) => {
  await initialize(page);
  const result = await page.evaluate(() => {
    const first = window.specialCharacterUI;
    const stale = first.element.querySelector<HTMLButtonElement>('[data-mw-character="euro"]')!;
    const mount = document.createElement('div');
    const host = document.createElement('div');
    document.body.append(mount, host);
    const secondEditor = window.createEditor(mount, { value: '<p>AB</p>' });
    secondEditor.setSelection(1);
    const second = window.specialCharacterModule.createSpecialCharacterUI(host, secondEditor, { characters: [{ id: 'other', text: '§', label: 'Section' }] });
    first.destroy(); first.destroy();
    stale.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const secondButton = second.element.querySelector<HTMLButtonElement>('button')!;
    secondButton.click();
    const values = { first: window.editor.getHTML(), second: secondEditor.getHTML() };
    secondEditor.destroy();
    secondButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const cleaned = host.childNodes.length === 0;
    second.destroy();
    let refreshRejected = false;
    try { first.refresh(); } catch { refreshRejected = true; }
    host.remove(); mount.remove();
    window.editor.focus();
    window.editor.setSelection(1);
    window.editor.insertHTML('!');
    return { ...values, cleaned, refreshRejected, editorUsable: window.editor.getHTML() };
  });
  expect(result).toEqual({ first: '<p>XY</p>', second: '<p>A§B</p>', cleaned: true, refreshRejected: true, editorUsable: '<p>X!Y</p>' });
});
