import { expect, test } from '@playwright/test';
import { initializeTableHeaders } from './table-headers-caption.fixture.js';
import './table-cell-typography.types.js';

const sample = '<table style="margin-left:auto;margin-right:auto"><caption>Keep caption</caption><tbody><tr><td title="A" rowspan="2" dir="ltr" style="text-align:left;color:navy"><p dir="ltr" style="text-align:right"><strong>Alpha</strong></p></td><td title="B" dir="rtl" style="text-align:right"><p>Beta</p></td><td title="C"><p>Outside</p></td></tr><tr><td title="D"><p>Delta</p></td><td title="E"><p>Other</p></td></tr></tbody></table><p>After</p>';

test('merged-cell typography changes are one transaction and retain actual cells, child overrides and backward selection', async ({ page }) => {
  await initializeTableHeaders(page, sample);
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const text = root.querySelector('strong')!.firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(text, 4, text, 1);
    window.headerTables.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const selected = window.headerSelection()!;
    const original = [root.firstChild!, ...root.querySelectorAll('*')];
    window.headerProperties.update({ cellTextAlign: 'justify', cellDirection: 'rtl', cellPadding: '6px' });
    const next = window.headerSelection()!;
    const state = window.headerProperties.getState();
    const child = root.querySelector<HTMLParagraphElement>('[title=A] p')!;
    return {
      values: [state.cellTextAlign, state.cellDirection, state.cellPadding],
      cells: next.cells.length, identity: next.cells.every((cell, index) => cell === selected.cells[index]),
      nodes: original.every((node) => root.contains(node)), rectangle: next.rectangle,
      child: [child.style.textAlign, child.getAttribute('dir')],
      backward: native.anchorNode === text && native.focusNode === text && native.anchorOffset === 4 && native.focusOffset === 1,
      outside: [...root.querySelectorAll<HTMLElement>('[title=C],[title=E]')].every((cell) => !cell.style.textAlign && !cell.hasAttribute('dir')),
      placement: root.querySelector('table')!.style.marginLeft, caption: root.querySelector('caption')!.textContent,
      changes: window.changes.length,
    };
  })).toEqual({ values: ['justify', 'rtl', '6px'], cells: 3, identity: true, nodes: true,
    rectangle: { top: 0, left: 0, bottom: 1, right: 1 }, child: ['right', 'ltr'], backward: true,
    outside: true, placement: 'auto', caption: 'Keep caption', changes: 1 });
  const after = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(after);
});

test('mixed own typography resets independently without rewriting inherited children or consuming redo on no-op', async ({ page }) => {
  await initializeTableHeaders(page, sample);
  expect(await page.evaluate(() => {
    window.headerTables.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const initial = window.headerProperties.getState();
    window.headerProperties.update({ cellTextAlign: 'center' });
    const aligned = window.headerProperties.getState();
    window.headerProperties.update({ cellDirection: false });
    const reset = window.headerProperties.getState();
    const child = window.editor.surface.querySelector<HTMLParagraphElement>('[title=A] p')!;
    window.editor.undo();
    const html = window.editor.getHTML();
    const count = window.changes.length;
    window.headerProperties.update({ cellTextAlign: 'center' });
    const noChange = html === window.editor.getHTML() && count === window.changes.length;
    const redo = window.editor.canRedo();
    window.headerProperties.update({ cellTextAlign: false, cellDirection: false });
    const cleared = window.headerProperties.getState();
    const changes = window.changes.length;
    window.headerProperties.update({ cellTextAlign: false, cellDirection: false });
    return { initial: [initial.cellTextAlign, initial.cellDirection], aligned: [aligned.cellTextAlign, aligned.cellDirection],
      reset: [reset.cellTextAlign, reset.cellDirection], child: [child.style.textAlign, child.getAttribute('dir')],
      noChange, redo, cleared: [cleared.cellTextAlign, cleared.cellDirection], resetNoop: changes === window.changes.length };
  })).toEqual({ initial: ['mixed', 'mixed'], aligned: ['center', 'mixed'], reset: ['center', false],
    child: ['right', 'ltr'], noChange: true, redo: true, cleared: [false, false], resetNoop: true });
});

test('invalid typography rejects complete patches before target lookup and readonly/composition guards remain authoritative', async ({ page }) => {
  await initializeTableHeaders(page, sample);
  expect(await page.evaluate(() => {
    const before = window.editor.getHTML();
    const invalid = {
      cellTextAlign: [undefined, null, true, 1, 'start', 'end', 'LEFT', ' left', 'inherit', 'center!important', 'left;color:red'],
      cellDirection: [undefined, null, 1, 'auto', 'RTL', ' rtl', 'inherit', 'rtl\n', 'rtl" onclick="alert(1)'],
    };
    const rejected = Object.entries(invalid).every(([key, values]) => values.every((value) => {
      try { window.headerProperties.update({ width: '70%', caption: 'Do not change', [key]: value } as never); return false; }
      catch { return window.editor.getHTML() === before && !window.editor.canUndo(); }
    }));
    window.editor.setReadOnly(true);
    window.headerProperties.update({ cellTextAlign: 'center', cellDirection: 'rtl' });
    let checkedReadonly = false;
    try { window.headerProperties.update({ cellDirection: undefined } as never); } catch { checkedReadonly = true; }
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composingDisabled = window.headerProperties.getState().disabled;
    window.headerProperties.update({ cellTextAlign: 'center', cellDirection: 'rtl' });
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const paragraph = window.editor.surface.lastElementChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(paragraph, 0, paragraph, 0);
    let checkedMissing = false;
    try { window.headerProperties.update({ cellTextAlign: 'unsafe' } as never); } catch { checkedMissing = true; }
    window.headerProperties.update({ cellTextAlign: 'center', cellDirection: 'rtl' });
    return { rejected, checkedReadonly, checkedMissing, composingDisabled, unchanged: before === window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() };
  })).toEqual({ rejected: true, checkedReadonly: true, checkedMissing: true, composingDisabled: true, unchanged: true, changes: 0, undo: false });
});

test('plugin-free HTML/JSON and cell clipboard retain typography while structural edits preserve surviving cells', async ({ page }) => {
  await initializeTableHeaders(page, sample);
  expect(await page.evaluate(() => {
    window.headerTables.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    window.headerProperties.update({ cellTextAlign: 'right', cellDirection: 'rtl' });
    const html = window.editor.getHTML();
    const json = window.editor.getJSON();
    const host = document.createElement('div'); document.body.append(host);
    const plain = window.createEditor(host, { value: html });
    const htmlSame = plain.getHTML() === html;
    plain.setJSON(json);
    const jsonSame = plain.getHTML() === html;
    const persisted = [...plain.surface.querySelectorAll<HTMLTableCellElement>('[title=A],[title=B],[title=D]')].map((cell) => [cell.style.textAlign, cell.getAttribute('dir')]);
    plain.destroy(); host.remove();
    const copied = window.headerTables.copy();
    const template = document.createElement('template'); template.innerHTML = copied.html;
    const clipboard = [...template.content.querySelectorAll<HTMLTableCellElement>('td,th')].map((cell) => [cell.style.textAlign, cell.getAttribute('dir')]);
    const survivor = window.editor.surface.querySelector<HTMLTableCellElement>('[title=A]')!;
    const child = survivor.querySelector('p')!;
    window.headerTables.columnRight();
    return { htmlSame, jsonSame, persisted, clipboard, sameCell: survivor.isConnected,
      survivor: [survivor.style.textAlign, survivor.getAttribute('dir')], child: [child.style.textAlign, child.getAttribute('dir')] };
  })).toEqual({ htmlSame: true, jsonSame: true, persisted: Array.from({ length: 3 }, () => ['right', 'rtl']),
    clipboard: Array.from({ length: 3 }, () => ['right', 'rtl']), sameCell: true, survivor: ['right', 'rtl'], child: ['right', 'ltr'] });
});

test('native form applies only dirty typography fields, supports mixed/reset and localized labels', async ({ page }) => {
  await initializeTableHeaders(page, sample, true);
  await page.evaluate(() => {
    window.headerTables.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    window.headerForm.refresh();
  });
  const form = page.locator('.headers-tools');
  const alignment = form.getByRole('combobox', { name: 'Cell text alignment', exact: true });
  const direction = form.getByRole('combobox', { name: 'Cell text direction', exact: true });
  await expect(alignment).toHaveValue('__mixed');
  await expect(direction).toHaveValue('__mixed');
  await alignment.selectOption('center');
  await form.getByRole('button', { name: 'Apply properties', exact: true }).click();
  expect(await page.evaluate(() => {
    const state = window.headerProperties.getState();
    const cells = window.headerSelection()!.cells;
    return { state: [state.cellTextAlign, state.cellDirection], directions: cells.map((cell) => cell.getAttribute('dir')), changes: window.changes.length };
  })).toEqual({ state: ['center', 'mixed'], directions: ['ltr', 'rtl', null], changes: 1 });
  await direction.selectOption('rtl');
  await form.getByRole('button', { name: 'Apply properties', exact: true }).click();
  await direction.selectOption('');
  await form.getByRole('button', { name: 'Apply properties', exact: true }).click();
  expect(await page.evaluate(() => {
    const state = window.headerProperties.getState();
    return [state.cellTextAlign, state.cellDirection];
  })).toEqual(['center', false]);
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(form.getByRole('combobox', { name: 'Выравнивание текста ячеек', exact: true })).toHaveValue('center');
  await expect(form.getByRole('combobox', { name: 'Направление текста ячеек', exact: true })).toHaveValue('');
  expect(await page.evaluate(() => {
    const before = window.headerForm.getValues();
    let rejected = false;
    try { window.headerForm.setValues({ cellTextAlign: 'left', cellDirection: 'auto' }); } catch { rejected = true; }
    return rejected && JSON.stringify(window.headerForm.getValues()) === JSON.stringify(before);
  })).toBe(true);
});

test('focus-time document replacement cannot redirect a typography draft to replacement cells', async ({ page }) => {
  await initializeTableHeaders(page, sample, true);
  const form = page.locator('.headers-tools');
  const alignment = form.getByRole('combobox', { name: 'Cell text alignment', exact: true });
  // selectOption dispatches input/change without necessarily moving browser focus.
  // A focus-time callback requires the form to own focus before Apply restores it.
  await alignment.focus();
  await alignment.selectOption('center');
  await expect(alignment).toBeFocused();
  await page.evaluate(() => {
    window.editor.surface.addEventListener('focus', () => {
      window.editor.setHTML('<table><tbody><tr><td title="replacement"><p>Replacement</p></td></tr></tbody></table>');
      const replacement = window.editor.surface.querySelector('td p')!;
      document.getSelection()!.setBaseAndExtent(replacement, 0, replacement, 0);
    }, { once: true });
  });
  await form.getByRole('button', { name: 'Apply properties', exact: true }).click();
  expect(await page.evaluate(() => {
    const cell = window.editor.surface.querySelector('td')!;
    return { text: cell.textContent, alignment: cell.style.textAlign, direction: cell.getAttribute('dir'), undo: window.editor.canUndo(), changes: window.changes.map((change) => change.source) };
  })).toEqual({ text: 'Replacement', alignment: '', direction: null, undo: false, changes: ['api'] });
});
