import { expect, test } from '@playwright/test';
import { initializeTableHeaders } from './table-headers-caption.fixture.js';
import { cellBoxSample } from './table-cell-box.fixture.js';
import './table-cell-box.types.js';

test('a combined cell-box patch preserves merged content, native/logical selection and one-step history', async ({ page }) => {
  await initializeTableHeaders(page, cellBoxSample);
  const before = await page.evaluate(() => window.editor.getHTML());
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const text = root.querySelector('strong')!.firstChild!;
    const native = document.getSelection()!;
    native.setBaseAndExtent(text, 4, text, 1);
    window.headerTables.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const selected = window.headerSelection()!;
    const nodes = [root.firstChild!, ...root.querySelectorAll('*')];
    window.headerProperties.update({ width: '60%', cellPadding: '12px', cellBorderWidth: '3px', cellBorderStyle: 'double', cellBorder: 'navy' });
    const state = window.headerProperties.getState();
    const current = window.headerSelection()!;
    return {
      values: [state.cellPadding, state.cellBorderWidth, state.cellBorderStyle],
      selected: current.cells.length, rectangle: current.rectangle,
      cells: current.cells.every((cell, index) => cell === selected.cells[index]),
      nodes: nodes.every((node) => root.contains(node)),
      backward: native.anchorNode === text && native.focusNode === text && native.anchorOffset === 4 && native.focusOffset === 1,
      outside: [...root.querySelectorAll<HTMLElement>('[title=C],[title=E]')].every((cell) => !cell.getAttribute('style')),
      borderColor: root.querySelector<HTMLTableCellElement>('[title=A]')!.style.borderColor,
      span: root.querySelector<HTMLTableCellElement>('[title=A]')!.rowSpan, changes: window.changes.length,
    };
  })).toEqual({ values: ['12px', '3px', 'double'], selected: 3, rectangle: { top: 0, left: 0, bottom: 1, right: 1 },
    cells: true, nodes: true, backward: true, outside: true, borderColor: 'navy', span: 2, changes: 1 });
  const changed = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(changed);
  expect(await page.evaluate((html) => {
    const host = document.createElement('div'); document.body.append(host);
    const plain = window.createEditor(host, { value: html });
    plain.setJSON(plain.getJSON());
    const styles = ['A', 'B', 'D'].map((title) => {
      const cell = [...plain.surface.querySelectorAll<HTMLTableCellElement>('td,th')].find((cell) => cell.title === title)!;
      return [cell.style.padding, cell.style.borderWidth, cell.style.borderStyle, cell.style.borderColor];
    });
    plain.destroy(); host.remove();
    return styles;
  }, changed)).toEqual(Array.from({ length: 3 }, () => ['12px', '3px', 'double', 'navy']));
});

test('mixed cell-box properties reset independently and idempotent patches preserve redo', async ({ page }) => {
  await initializeTableHeaders(page, cellBoxSample);
  expect(await page.evaluate(() => {
    window.headerTables.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const first = window.headerProperties.getState();
    window.headerProperties.update({ cellPadding: '8px' });
    const padding = window.headerProperties.getState();
    window.headerProperties.update({ cellBorderWidth: false, cellBorderStyle: false });
    const reset = window.headerProperties.getState();
    const cell = window.editor.surface.querySelector<HTMLTableCellElement>('[title=A]')!;
    const color = cell.style.borderColor;
    window.editor.undo();
    const count = window.changes.length;
    const html = window.editor.getHTML();
    window.headerProperties.update({ cellPadding: '8px' });
    return { first: [first.cellPadding, first.cellBorderWidth, first.cellBorderStyle],
      padding: [padding.cellPadding, padding.cellBorderWidth, padding.cellBorderStyle],
      reset: [reset.cellPadding, reset.cellBorderWidth, reset.cellBorderStyle], color,
      noop: window.editor.getHTML() === html && window.changes.length === count, redo: window.editor.canRedo() };
  })).toEqual({ first: ['mixed', 'mixed', 'mixed'], padding: ['8px', 'mixed', 'mixed'], reset: ['8px', false, false], color: 'navy', noop: true, redo: true });
});

test('strict cell-box validation rejects the whole patch and existing readonly/IME gates block valid writes', async ({ page }) => {
  await initializeTableHeaders(page, cellBoxSample);
  expect(await page.evaluate(() => {
    const before = window.editor.getHTML();
    const invalid = {
      cellPadding: [undefined, null, 4, true, '49px', '-1px', '01px', '1.5px', '1em', '4px 8px', 'inherit', 'var(--padding)', 'calc(1px)', '4px!important', '4px;background:red'],
      cellBorderWidth: [undefined, null, 2, '13px', '00px', '2%', '2px 3px', 'url(/cell-box-probe)'],
      cellBorderStyle: [undefined, null, true, 'groove', 'ridge', 'hidden', 'initial', 'solid dashed', 'solid;border-color:red'],
    };
    const rejected = Object.entries(invalid).every(([field, values]) => values.every((value) => {
      try { window.headerProperties.update({ width: '70%', caption: 'Do not change', [field]: value } as never); return false; }
      catch { return window.editor.getHTML() === before && !window.editor.canUndo(); }
    }));
    window.editor.setReadOnly(true);
    window.headerProperties.update({ cellPadding: '48px', cellBorderWidth: '12px', cellBorderStyle: 'none' });
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.headerProperties.update({ cellPadding: '0px', cellBorderWidth: '0px', cellBorderStyle: 'solid' });
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return { rejected, unchanged: before === window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length };
  })).toEqual({ rejected: true, unchanged: true, undo: false, changes: 0 });
  await page.evaluate(() => {
    const surface = window.editor.surface;
    const cell = surface.querySelector('td')!;
    surface.focus();
    document.getSelection()!.setBaseAndExtent(cell, 0, cell, 0);
    window.headerProperties.update({ cellPadding: '48px', cellBorderWidth: '12px', cellBorderStyle: 'none' });
  });
  expect(await page.evaluate(() => {
    const state = window.headerProperties.getState();
    return [state.cellPadding, state.cellBorderWidth, state.cellBorderStyle];
  })).toEqual(['48px', '12px', 'none']);
});

test('plugin-free codecs and rectangle clipboard keep bounded cell-box values while unsafe CSS and other tags lose them', async ({ page }) => {
  const value = '<p style="padding:4px;border-width:2px;border-style:solid;border:1px solid red">Outside</p><table style="padding:4px;border-style:dashed;border:1px solid red"><caption>Caption</caption><tbody><tr style="padding:4px"><th scope="col" style="padding:0px;border-width:0px;border-style:none">Head</th><td style="padding:48px;border:12px double navy">Allowed</td></tr><tr><td style="padding:49px;border-width:13px;border-style:groove;padding-left:4px;border-top-width:2px;border:13px solid red;position:fixed">Invalid</td><td style="padding:var(--x);border-width:calc(1px);border-style:solid dashed;border:1px solid url(/cell-box-probe);border:1px solid zzzinvalid">Unsafe</td></tr></tbody></table><p>After</p>';
  await initializeTableHeaders(page, value);
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const table = root.querySelector('table')!;
    const cells = [...table.querySelectorAll<HTMLTableCellElement>('td,th')];
    const outside = [root.querySelector('p')!, table, table.rows[0]].every((node) => !node.style.padding && !node.style.borderWidth && !node.style.borderStyle);
    const values = cells.map((cell) => [cell.style.padding, cell.style.borderWidth, cell.style.borderStyle]);
    const html = window.editor.getHTML();
    const json = window.editor.getJSON();
    const host = document.createElement('div'); document.body.append(host);
    const plain = window.createEditor(host, { value: html });
    const sameHTML = plain.getHTML() === html;
    plain.setJSON(json);
    const sameJSON = plain.getHTML() === html;
    plain.setJSON({ version: 1, children: [{ type: 'element', tag: 'table', attributes: { style: 'padding:8px;border:2px dotted navy' }, children: [
      { type: 'element', tag: 'tbody', attributes: {}, children: [{ type: 'element', tag: 'tr', attributes: {}, children: [
        { type: 'element', tag: 'td', attributes: { style: 'padding:8px;padding-left:9px;border:2px dotted rgb(1, 2, 3);border-style:var(--x);position:fixed' }, children: [{ type: 'text', text: 'JSON' }] },
      ] }] },
    ] }] });
    const jsonCell = plain.surface.querySelector('td')!;
    const jsonBoundary = [jsonCell.style.padding, jsonCell.style.paddingLeft, jsonCell.style.borderWidth, jsonCell.style.borderStyle,
      jsonCell.style.borderColor, jsonCell.style.position, plain.surface.querySelector('table')!.style.padding];
    plain.destroy(); host.remove();
    const range = document.createRange(); range.selectNodeContents(cells[0]); range.collapse(true);
    root.focus(); document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    window.headerTables.select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const template = document.createElement('template'); template.innerHTML = window.headerTables.copy().html;
    const copied = [...template.content.querySelectorAll<HTMLTableCellElement>('td,th')].map((cell) => [cell.style.padding, cell.style.borderWidth, cell.style.borderStyle]);
    window.headerTables.columnRight();
    const survivor = [...table.querySelectorAll<HTMLTableCellElement>('td,th')].find((cell) => cell.textContent === 'Allowed')!;
    return { outside, values, sameHTML, sameJSON, jsonBoundary, copied, survivor: [survivor.style.padding, survivor.style.borderWidth, survivor.style.borderStyle] };
  })).toEqual({ outside: true, values: [['0px', '0px', 'none'], ['48px', '12px', 'double'], ['', '', ''], ['', '', '']],
    sameHTML: true, sameJSON: true, jsonBoundary: ['8px', '8px', '2px', 'dotted', 'rgb(1, 2, 3)', '', ''],
    copied: [['0px', '0px', 'none'], ['48px', '12px', 'double']], survivor: ['48px', '12px', 'double'] });
});

test('HTML and JSON reject normalized style overflow, including added image dimensions, before live mutation', async ({ page }) => {
  await initializeTableHeaders(page, cellBoxSample);
  expect(await page.evaluate(() => {
    window.headerProperties.update({ cellPadding: '6px' });
    window.headerProperties.update({ cellBorderStyle: 'dotted' });
    window.editor.undo();
    const before = window.editor.getHTML();
    const root = window.editor.surface;
    const original = [root.firstChild!, ...root.querySelectorAll('*')];
    const changes = window.changes.length;
    const history = { undo: window.editor.canUndo(), redo: window.editor.canRedo() };
    const borders = 'border:1px solid red;'.repeat(950);
    const colors = 'color:red;'.repeat(1666);
    const rejected = [borders, colors].flatMap((style, index) => ['html', 'json'].map((boundary) => {
      let rangeError = false;
      try {
        if (boundary === 'html') {
          window.editor.setHTML(index === 0
            ? `<table><tbody><tr><td style="${style}">Too large after normalization</td></tr></tbody></table>`
            : `<p><img src="/logo.svg" width="1000" style="${style}"></p>`);
        }
        else {
          window.editor.setJSON({ version: 1, children: index === 0 ? [
            { type: 'element', tag: 'table', attributes: {}, children: [{ type: 'element', tag: 'tbody', attributes: {}, children: [
              { type: 'element', tag: 'tr', attributes: {}, children: [{ type: 'element', tag: 'td', attributes: { style }, children: [{ type: 'text', text: 'Too large' }] }] },
            ] }] },
          ] : [
            { type: 'element', tag: 'p', attributes: {}, children: [{ type: 'element', tag: 'img', attributes: { src: '/logo.svg', width: '1000', style }, children: [] }] },
          ] });
        }
      }
      catch (error) { rangeError = error instanceof RangeError; }
      return rangeError && window.editor.getHTML() === before && original.every((node) => root.contains(node))
        && window.editor.canUndo() === history.undo && window.editor.canRedo() === history.redo && window.changes.length === changes;
    }));
    return { inputLengths: [borders.length, colors.length], history, rejected };
  })).toEqual({ inputLengths: [19950, 16660], history: { undo: true, redo: true }, rejected: [true, true, true, true] });
});
