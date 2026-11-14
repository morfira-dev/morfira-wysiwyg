import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { SchemaContribution } from '@morfira-dev/wysiwyg';
import type { ChecklistCommands } from '@morfira-dev/wysiwyg/plugins/checklists';

declare global { interface Window { checklistAPI: ChecklistCommands; } }

const initialize = async (page: Page, html: string, schema: SchemaContribution[] = []) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ html, schema }) => {
    const modulePath = '/packages/plugins/dist/checklists.js';
    const { checklists, checklistCommands } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/plugins/checklists');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'checklists-test';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, { value: html, schema, plugins: [checklists()], onChange: (change) => window.changes.push(change) });
    window.checklistAPI = checklistCommands(window.editor);
    window.dispose = () => window.editor.destroy();
  }, { html, schema });
};
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());
const caret = (page: Page, selector: string, offset = 0) => page.evaluate(({ selector, offset }) => {
  const root = window.editor.surface;
  const element = root.querySelector(selector)!;
  root.focus();
  const node = element.firstChild?.nodeType === 3 ? element.firstChild : element;
  document.getSelection()!.setBaseAndExtent(node, offset, node, offset);
}, { selector, offset });

// Each case covers a different command/editing contract; browser projects supply
// engine coverage without a payload/route/direction Cartesian product.
test('insert converts one root paragraph into an unchecked task with one change and reversible selection', async ({ page }) => {
  const before = '<p title="Source">A<strong>B</strong>C</p><p title="Keep">Keep</p>';
  await initialize(page, before);
  await caret(page, '[title="Source"]', 1);
  expect(await page.evaluate(() => window.checklistAPI.getState())).toEqual({ disabled: false, active: false, checked: undefined });
  await page.evaluate(() => window.checklistAPI.insert());
  await expect(page.locator('.checklists-test .mw-content > ul > li')).toHaveCount(1);
  await expect(page.locator('.checklists-test li')).toHaveAttribute('data-checklist-checked', 'false');
  await expect(page.locator('.checklists-test li')).toHaveText('ABC');
  await expect(page.locator('.checklists-test li strong')).toHaveText('B');
  await expect(page.locator('.checklists-test [title="Keep"]')).toHaveText('Keep');
  expect(await page.evaluate(() => ({ state: window.checklistAPI.getState(), changes: window.changes.length, version: window.editor.getJSON().version }))).toEqual({ state: { disabled: false, active: true, checked: false }, changes: 1, version: 1 });
  const inserted = await html(page);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ point: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Source"]')!.firstChild, offset: document.getSelection()!.anchorOffset, undo: window.editor.canUndo() }))).toEqual({ point: true, offset: 1, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(inserted);
});

test('mixed ordered items keep actual nodes while insert/set/toggle/remove preserve isolated history and idempotence', async ({ page }) => {
  await initialize(page, '<ol start="4"><li title="Item">A<strong>B</strong></li><li title="Checked" data-checklist-checked="true">Checked</li><li title="Keep">Keep</li></ol>');
  const item = await page.locator('.checklists-test [title="Item"]').elementHandle();
  const kept = await page.locator('.checklists-test [title="Keep"]').elementHandle();
  await caret(page, '[title="Item"]', 1);
  await page.evaluate(() => window.checklistAPI.insert());
  expect(await page.evaluate(() => window.checklistAPI.getState())).toEqual({ disabled: false, active: true, checked: false });
  await page.evaluate(() => { window.checklistAPI.insert(); window.checklistAPI.setChecked(true); window.checklistAPI.setChecked(true); });
  expect(await page.evaluate(() => window.changes.length)).toBe(2);
  await page.evaluate(() => window.checklistAPI.toggle());
  await expect(page.locator('.checklists-test [title="Item"]')).toHaveAttribute('data-checklist-checked', 'false');
  await page.evaluate(() => window.checklistAPI.remove());
  await expect(page.locator('.checklists-test [title="Item"]')).not.toHaveAttribute('data-checklist-checked');
  expect(await page.evaluate(() => window.checklistAPI.getState())).toEqual({ disabled: false, active: false, checked: undefined });
  for (const node of [item, kept]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.checklists-test ol')).toHaveAttribute('start', '4');
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.checklists-test [title="Item"]')).toHaveAttribute('data-checklist-checked', 'false');
  const baseline = await html(page);
  expect(await page.evaluate(() => {
    const changes = window.changes.length;
    const selection = window.editor.getSelection();
    let rejected = false;
    try { window.checklistAPI.setChecked('yes' as unknown as boolean); } catch (error) { rejected = error instanceof TypeError; }
    return { rejected, unchangedChanges: window.changes.length === changes, selection: window.editor.getSelection(), previous: selection };
  })).toMatchObject({ rejected: true, unchangedChanges: true, selection: { index: 1, length: 0 }, previous: { index: 1, length: 0 } });
  expect(await html(page)).toBe(baseline);
  await caret(page, '[title="Checked"]', 1);
  const changes = await page.evaluate(() => window.changes.length);
  await page.evaluate(() => window.checklistAPI.insert());
  expect(await page.evaluate(() => ({ checked: window.checklistAPI.getState().checked, changes: window.changes.length }))).toEqual({ checked: true, changes });
});

test('a same-owner range changes only its item while cross-item, outside and semantic endpoints stay disabled', async ({ page }) => {
  const reference: SchemaContribution = { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } };
  await initialize(page, '<ul><li title="Owner"><p title="Start">AB</p><ul><li title="Child" data-checklist-checked="true">Child</li></ul><p title="End">CD</p></li><li title="Other">Other</li><li data-checklist-checked="true"><span data-mw-node="test:reference" data-id="owned">Owned</span></li></ul>', [reference]);
  await page.evaluate(() => {
    const root = window.editor.surface;
    root.focus();
    document.getSelection()!.setBaseAndExtent(root.querySelector('[title="End"]')!.firstChild!, 1, root.querySelector('[title="Start"]')!.firstChild!, 1);
    window.checklistAPI.insert();
  });
  await expect(page.locator('.checklists-test [title="Owner"]')).toHaveAttribute('data-checklist-checked', 'false');
  await expect(page.locator('.checklists-test [title="Child"]')).toHaveAttribute('data-checklist-checked', 'true');
  expect(await page.evaluate(() => {
    const selection = document.getSelection()!;
    const root = window.editor.surface;
    return { anchorAtEnd: selection.anchorNode === root.querySelector('[title="End"]')!.firstChild, focusAtStart: selection.focusNode === root.querySelector('[title="Start"]')!.firstChild, anchor: selection.anchorOffset, focus: selection.focusOffset };
  })).toEqual({ anchorAtEnd: true, focusAtStart: true, anchor: 1, focus: 1 });
  const baseline = await html(page);
  const result = await page.evaluate(() => {
    const root = window.editor.surface;
    const selection = document.getSelection()!;
    const disabled: boolean[] = [];
    selection.setBaseAndExtent(root.querySelector('[title="Other"]')!.firstChild!, 1, root.querySelector('[title="Start"]')!.firstChild!, 1);
    disabled.push(window.checklistAPI.getState().disabled);
    window.checklistAPI.insert();
    selection.removeAllRanges();
    disabled.push(window.checklistAPI.getState().disabled);
    window.checklistAPI.toggle();
    const owned = root.querySelector('[data-id="owned"]')!.firstChild!;
    selection.setBaseAndExtent(owned, 1, owned, 1);
    disabled.push(window.checklistAPI.getState().disabled);
    window.checklistAPI.remove();
    return { disabled, changes: window.changes.length };
  });
  expect(result).toEqual({ disabled: [true, true, true], changes: 1 });
  expect(await html(page)).toBe(baseline);
});

test('direct task Enter retains the checked source and resets only the new sibling; ordinary items remain ordinary', async ({ page }) => {
  const before = '<ul><li title="Source" data-checklist-checked="true">AB</li><li title="Keep">Keep</li></ul>';
  await initialize(page, before);
  const source = await page.locator('.checklists-test [title="Source"]').elementHandle();
  const keep = await page.locator('.checklists-test [title="Keep"]').elementHandle();
  await caret(page, '[title="Source"]', 1);
  await page.keyboard.press('Enter');
  expect(await page.locator('.checklists-test .mw-content > ul > li').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, checked: node.getAttribute('data-checklist-checked') })))).toEqual([{ text: 'A', checked: 'true' }, { text: 'B', checked: 'false' }, { text: 'Keep', checked: null }]);
  for (const node of [source, keep]) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => ({ state: window.checklistAPI.getState(), changes: window.changes.length }))).toEqual({ state: { disabled: false, active: true, checked: false }, changes: 1 });
  const inserted = await html(page);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
  expect(await page.evaluate(() => ({ point: document.getSelection()!.anchorNode === window.editor.surface.querySelector('[title="Source"]')!.firstChild, offset: document.getSelection()!.anchorOffset }))).toEqual({ point: true, offset: 1 });
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(inserted);
  await page.evaluate(() => window.editor.setHTML('<ul><li title="Plain">AB</li></ul>'));
  await caret(page, '[title="Plain"]', 1);
  await page.keyboard.press('Enter');
  await expect(page.locator('.checklists-test li')).toHaveCount(2);
  await expect(page.locator('.checklists-test [data-checklist-checked]')).toHaveCount(0);
});

test('wrapped task Enter transfers later blocks and branches while only the cloned item resets', async ({ page }) => {
  const before = '<ol start="3"><li data-checklist-checked="true"><h2 title="Body">AB</h2><p title="Later">Later</p><ul title="Branch"><li data-checklist-checked="true">Child</li></ul></li><li title="Keep">Keep</li></ol>';
  await initialize(page, before);
  const nodes = await Promise.all(['Later', 'Branch', 'Keep'].map((title) => page.locator(`.checklists-test [title="${title}"]`).elementHandle()));
  await caret(page, '[title="Body"]', 1);
  await page.keyboard.press('Enter');
  expect(await page.locator('.checklists-test .mw-content > ol > li').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-checklist-checked')))).toEqual(['true', 'false', null]);
  await expect(page.locator('.checklists-test .mw-content > ol > li').nth(1)).toHaveText('BLaterChild');
  await expect(page.locator('.checklists-test [title="Branch"] > li')).toHaveAttribute('data-checklist-checked', 'true');
  for (const node of nodes) expect(await node!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => ({ changes: window.changes.length, checked: window.checklistAPI.getState().checked }))).toEqual({ changes: 1, checked: false });
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('Shift+Enter leaves task state on its actual item and following ordinary typing remains separate history', async ({ page }) => {
  const before = '<ul><li data-checklist-checked="true"><p title="Body">AB</p><h2>Later</h2></li></ul>';
  await initialize(page, before);
  await caret(page, '[title="Body"]', 1);
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.checklists-test .mw-content > ul > li')).toHaveCount(1);
  await expect(page.locator('.checklists-test li')).toHaveAttribute('data-checklist-checked', 'true');
  await expect(page.locator('.checklists-test [title="Body"] > br')).toHaveCount(1);
  const split = await html(page);
  await page.keyboard.type('X');
  await expect(page.locator('.checklists-test [title="Body"]')).toHaveText('AXB');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(split);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe(before);
});

test('indent and outdent move actual task items without changing their state or marking ordinary siblings', async ({ page }) => {
  const before = '<ul><li title="Parent">Parent</li><li title="Task" data-checklist-checked="true"><em>Task</em></li><li title="Ordinary">Ordinary</li></ul>';
  await initialize(page, before);
  const task = await page.locator('.checklists-test [title="Task"]').elementHandle();
  await caret(page, '[title="Task"] em', 1);
  await page.evaluate(() => window.editor.format('indent', 1));
  await expect(page.locator('.checklists-test [title="Parent"] > ul > [title="Task"]')).toHaveAttribute('data-checklist-checked', 'true');
  expect(await task!.evaluate((node) => node.isConnected)).toBe(true);
  await page.evaluate(() => window.editor.format('indent', -1));
  expect(await html(page)).toBe(before);
  expect(await task!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.checklists-test [title="Ordinary"]')).not.toHaveAttribute('data-checklist-checked');
  await page.evaluate(() => window.editor.undo());
  await expect(page.locator('.checklists-test [title="Parent"] > ul > li')).toHaveAttribute('data-checklist-checked', 'true');
});

test('joins retain the surviving first item state and exiting a task drops only LI metadata', async ({ page }) => {
  await initialize(page, '<ul><li title="First" data-checklist-checked="false">AB</li><li title="Last" data-checklist-checked="true">CD</li></ul>');
  await caret(page, '[title="Last"]');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.checklists-test .mw-content > ul > li')).toHaveCount(1);
  await expect(page.locator('.checklists-test li')).toHaveAttribute('data-checklist-checked', 'false');
  await expect(page.locator('.checklists-test li')).toHaveText('ABCD');
  await page.evaluate(() => window.editor.undo());
  await page.evaluate(() => {
    const root = window.editor.surface;
    document.getSelection()!.setBaseAndExtent(root.querySelector('[title="Last"]')!.firstChild!, 1, root.querySelector('[title="First"]')!.firstChild!, 1);
    window.editor.insertHTML('<strong>X</strong>');
  });
  await expect(page.locator('.checklists-test li')).toHaveText('AXD');
  await expect(page.locator('.checklists-test li')).toHaveAttribute('data-checklist-checked', 'false');
  await page.evaluate(() => window.editor.setHTML('<ul><li data-checklist-checked="true"><p title="Body">Task</p></li></ul>'));
  await caret(page, '[title="Body"]');
  await page.evaluate(() => window.editor.format('list', false));
  await expect(page.locator('.checklists-test li')).toHaveCount(0);
  await expect(page.locator('.checklists-test [data-checklist-checked]')).toHaveCount(0);
  await expect(page.locator('.checklists-test .mw-content')).toHaveText('Task');
});

test('read-only and composition disable mutations while checked state and external synchronization remain available', async ({ page }) => {
  await initialize(page, '<ul><li title="Task" data-checklist-checked="true">Task</li></ul>');
  await caret(page, '[title="Task"]', 1);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setReadOnly(true);
    const readonly = window.checklistAPI.getState();
    window.checklistAPI.setChecked(false);
    window.checklistAPI.remove();
    const guarded = editor.getHTML();
    editor.setHTML('<ol><li title="External" data-checklist-checked="false">External</li></ol>');
    const external = editor.getHTML();
    editor.setReadOnly(false);
    const point = editor.surface.querySelector('li')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(point, 1, point, 1);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composing = window.checklistAPI.getState();
    window.checklistAPI.toggle();
    const after = editor.getHTML();
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    return { readonly, composing, guarded, external, after, sources: window.changes.map((change) => change.source), undo: editor.canUndo() };
  })).toEqual({ readonly: { disabled: true, active: true, checked: true }, composing: { disabled: true, active: true, checked: false }, guarded: '<ul><li title="Task" data-checklist-checked="true">Task</li></ul>', external: '<ol><li title="External" data-checklist-checked="false">External</li></ol>', after: '<ol><li title="External" data-checklist-checked="false">External</li></ol>', sources: ['api'], undo: false });
});

test('plugin metadata survives HTML/JSON and paste while invalid registered values reject atomically', async ({ page }) => {
  await initialize(page, '<p title="Target">Target</p>');
  await caret(page, '[title="Target"]', 2);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    const baseline = editor.getHTML();
    const selection = editor.getSelection();
    const failures: boolean[] = [];
    for (const value of ['TRUE', '', 'yes']) {
      try { editor.setHTML(`<ul><li data-checklist-checked="${value}">Invalid</li></ul>`); failures.push(false); }
      catch { failures.push(editor.getHTML() === baseline); }
    }
    const json = { version: 1, children: [{ type: 'element', tag: 'ul', attributes: {}, children: [{ type: 'element', tag: 'li', attributes: { 'data-checklist-checked': 'invalid' }, children: [{ type: 'text', text: 'Invalid' }] }] }] };
    try { editor.setJSON(json as ReturnType<typeof editor.getJSON>); failures.push(false); } catch { failures.push(editor.getHTML() === baseline); }
    return { failures, selection: editor.getSelection(), previous: selection, undo: editor.canUndo(), changes: window.changes.length };
  })).toEqual({ failures: [true, true, true, true], selection: { index: 2, length: 0 }, previous: { index: 2, length: 0 }, undo: false, changes: 0 });
  await page.evaluate(() => {
    const editor = window.editor;
    editor.setSelection(0, 6);
    const data = new DataTransfer();
    data.setData('text/html', '<ul><li data-checklist-checked="true" onclick="alert(1)"><strong>Imported</strong></li><li>Ordinary</li></ul>');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    editor.surface.dispatchEvent(event);
  });
  await expect(page.locator('.checklists-test li').first()).toHaveAttribute('data-checklist-checked', 'true');
  await expect(page.locator('.checklists-test li strong')).toHaveText('Imported');
  await expect(page.locator('.checklists-test [onclick]')).toHaveCount(0);
  const imported = await html(page);
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p title="Target">Target</p>');
  await page.evaluate(() => window.editor.redo());
  expect(await html(page)).toBe(imported);
  expect(await page.evaluate(() => { const value = window.editor.getJSON(); window.editor.setJSON(value); return window.editor.getHTML(); })).toBe(imported);
});

test('instances isolate task state and disposed command handles cannot mutate another editor', async ({ page }) => {
  await initialize(page, '<ul><li title="Task" data-checklist-checked="true">First</li></ul>');
  await caret(page, '[title="Task"]', 1);
  expect(await page.evaluate(async () => {
    const modulePath = '/packages/plugins/dist/checklists.js';
    const { checklists, checklistCommands } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/plugins/checklists');
    const host = document.createElement('div');
    document.body.append(host);
    const second = window.createEditor(host, { value: '<ul><li data-checklist-checked="false">Second</li></ul>', plugins: [checklists()] });
    const secondAPI = checklistCommands(second);
    second.surface.focus();
    const point = second.surface.querySelector('li')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(point, 1, point, 1);
    secondAPI.setChecked(true);
    const firstUnchanged = window.editor.getHTML();
    const secondState = secondAPI.getState();
    window.editor.destroy();
    let disposed = 0;
    for (const read of [window.checklistAPI.getState, window.checklistAPI.toggle]) {
      try { read(); } catch { disposed++; }
    }
    const secondAfter = second.getHTML();
    second.destroy();
    return { firstUnchanged, secondState, secondAfter, disposed };
  })).toEqual({ firstUnchanged: '<ul><li title="Task" data-checklist-checked="true">First</li></ul>', secondState: { disabled: false, active: true, checked: true }, secondAfter: '<ul><li data-checklist-checked="true">Second</li></ul>', disposed: 2 });
});
