import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { setupFormula } from './formula.fixture.js';

const formulaSelector = 'span[data-mw-node="morfira:formula"]';

test('formula parser is DOM-free, bounded and rejects unsupported commands instead of executing them', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    delete globalThis.window; delete globalThis.document;
    const { parseFormula } = await import('@morfira-dev/wysiwyg/plugins/formula');
    const { createFormulaView, createFormulaForm } = await import('@morfira-dev/wysiwyg/ui/formula');
    if (typeof createFormulaView !== 'function' || typeof createFormulaForm !== 'function') throw Error('UI exports');
    const ast = parseFormula('x_1^2+\\\\frac{1}{\\\\sqrt{y}}+\\\\alpha');
    if (ast.type !== 'row' || !Object.isFrozen(ast) || ast.children[0].type !== 'scripts') throw Error('AST');
    parseFormula('\\\\frac{{x}}{{y}}');
    const inputs = ['', 'x'.repeat(1025), '+'.repeat(512), '{'.repeat(25)+'x'+'}'.repeat(25),
      '\\\\href{javascript:alert(1)}{x}', '\\\\includegraphics{https://example.org/x}', '\\\\style{x}{y}',
      '\\\\unknown{x}', '\\\\frac{}{x}', '\\\\frac{{}}{x}', '\\\\frac{x}{{{ }}}', '\\\\sqrt{{ }}', '{{}}',
      'x^', 'x^2^3', '{x', 'x}', 'x\\n', '\\\\'];
    for (const input of inputs) {
      let rejected = false;
      try { parseFormula(input); } catch { rejected = true; }
      if (!rejected) throw Error('Accepted invalid input: '+JSON.stringify(input));
    }
    process.stdout.write('safe');
  `], { encoding: 'utf8' });
  expect(output).toBe('safe');
});

test.beforeEach(async ({ page }) => setupFormula(page));

test('formula rendering uses only native MathML and persists literal canonical source with history', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { editor, commands, viewHost } = window.formulaProbe;
    const source = String.raw`x_1^2+\frac{1}{\sqrt{y}}`;
    const inserted = commands.insert(source);
    const node = editor.surface.querySelector('span')!;
    const html = editor.getHTML();
    const math = viewHost.querySelector('math')!;
    const namespaces = [...math.querySelectorAll('*'), math].every((item) => item.namespaceURI === 'http://www.w3.org/1998/Math/MathML');
    const tags = [...math.querySelectorAll('*')].map((item) => item.localName);
    const literal = node.textContent === source && !editor.surface.querySelector('math');
    const atom = node.getAttribute('contenteditable');
    const path = '/packages/plugins/dist/formula.js';
    const { renderFormula } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/formula');
    const safeLiteral = renderFormula(document, '<img>');
    const inert = !safeLiteral.querySelector('img,script,a,style') && safeLiteral.textContent === '<img>';
    editor.undo();
    const undo = editor.getHTML();
    const emptyViews = viewHost.childElementCount;
    editor.redo();
    const redo = editor.getHTML();
    const json = editor.getJSON();
    editor.setHTML('<p>temporary</p>');
    editor.setJSON(json);
    return { inserted, html, namespaces, tags, literal, atom, inert, undo, emptyViews, redo, jsonRoundtrip: editor.getHTML() === html };
  });
  expect(result.inserted).toBe(true);
  expect(result.html).toBe('<p>A<span data-mw-node="morfira:formula">x_1^2+\\frac{1}{\\sqrt{y}}</span>B</p>');
  expect(result.namespaces && result.literal && result.inert && result.jsonRoundtrip).toBe(true);
  expect(result.tags).toEqual(expect.arrayContaining(['msubsup', 'mfrac', 'msqrt']));
  expect(result.atom).toBe('false');
  expect(result.undo).toBe('<p>AB</p>');
  expect(result.emptyViews).toBe(0);
  expect(result.redo).toBe(result.html);
});

test('commands refuse stale targets, readonly edits and malformed sources atomically; remove is undoable', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, commands } = window.formulaProbe;
    commands.insert('x^2');
    const original = editor.surface.querySelector('span')!;
    const before = editor.getHTML();
    let rejected = false;
    try { commands.update(original, String.raw`\href{x}{y}`); } catch { rejected = true; }
    editor.setReadOnly(true);
    const readonly = [commands.insert('z'), commands.update(original, 'y'), commands.remove(original)];
    const unchanged = editor.getHTML() === before;
    editor.setReadOnly(false);
    editor.setHTML('<p>temporary</p>');
    editor.setHTML(before);
    const stale = commands.update(original, 'z');
    const removed = commands.remove(editor.surface.querySelector('span')!);
    const afterRemove = editor.getHTML();
    editor.undo();
    return { rejected, readonly, unchanged, stale, removed, afterRemove, html: editor.getHTML() };
  });
  expect(result.rejected && result.unchanged).toBe(true);
  expect(result.readonly).toEqual([false, false, false]);
  expect(result.stale).toBe(false);
  expect(result.removed).toBe(true);
  expect(result.afterRemove).toBe('<p>AB</p>');
  expect(result.html).toContain('x^2');
});

test('imported unsupported source stays literal and view lifecycle cleans only its external nodes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, view, viewHost } = window.formulaProbe;
    const sentinel = document.createElement('p');
    sentinel.textContent = 'application owned';
    viewHost.append(sentinel);
    editor.setHTML('<p><span data-mw-node="morfira:formula">\\unknown{x}</span></p>');
    const invalid = viewHost.querySelector('[data-formula-invalid]')!;
    const safe = invalid.querySelector('code')?.textContent === String.raw`\unknown{x}` && !invalid.querySelector('math');
    editor.setLocale('ru');
    const translated = invalid.textContent!.includes('Неподдерживаемая');
    view.destroy();
    view.destroy();
    const remaining = viewHost.textContent;
    editor.setHTML('<p><span data-mw-node="morfira:formula">x</span></p>');
    return { safe, translated, remaining, views: viewHost.querySelectorAll('.mw-formula-view').length, html: editor.getHTML() };
  });
  expect(result).toEqual({ safe: true, translated: true, remaining: 'application owned', views: 0,
    html: '<p><span data-mw-node="morfira:formula">x</span></p>' });
});

test('native formula modal inserts at captured cursor, edits the explicit atom and restores history', async ({ page }) => {
  await page.evaluate(() => { const { form } = window.formulaProbe; form.open(); form.setSource(String.raw`\frac{a}{b}`); });
  await expect(page.getByRole('dialog', { name: 'Formula', exact: true })).toBeVisible();
  await expect(page.locator('dialog math mfrac')).toHaveCount(1);
  await page.getByRole('button', { name: 'Apply formula', exact: true }).click();
  await expect(page.locator(formulaSelector)).toHaveText('\\frac{a}{b}');
  await page.evaluate(() => {
    const { editor, form } = window.formulaProbe;
    form.open(editor.surface.querySelector('span')!);
    form.setSource('x_1');
  });
  await page.getByRole('button', { name: 'Apply formula', exact: true }).click();
  await expect(page.locator(formulaSelector)).toHaveText('x_1');
  const result = await page.evaluate(() => {
    const { editor } = window.formulaProbe;
    editor.undo();
    const undoEdit = editor.getHTML();
    editor.undo();
    const undoInsert = editor.getHTML();
    return { undoEdit, undoInsert };
  });
  expect(result.undoEdit).toContain('\\frac{a}{b}');
  expect(result.undoInsert).toBe('<p>AB</p>');
});

test('invalid drafts stay open; readonly, IME, external replacement and focus races cannot commit', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { editor, form } = window.formulaProbe;
    const clickApply = () => (form.element.querySelector('button') as HTMLButtonElement).click();
    form.open();
    form.setSource(String.raw`\unknown{x}`);
    clickApply();
    const invalidOpen = form.isOpen();
    const invalidMessage = form.element.querySelector('[role="status"]')?.textContent;
    editor.setReadOnly(true);
    const readonlyClosed = !form.isOpen();
    form.open();
    const readonlyRefused = !form.isOpen();
    editor.setReadOnly(false);
    editor.setSelection(1);
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    form.open();
    const imeRefused = !form.isOpen();
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    editor.setSelection(1);
    form.open();
    form.setSource('x');
    editor.setHTML('<p>replacement</p>');
    const replacementClosed = !form.isOpen();
    editor.setSelection(1);
    form.open();
    form.setSource('x');
    const onFocus = () => editor.setHTML('<p>focus replacement</p>');
    editor.surface.addEventListener('focus', onFocus, { once: true });
    clickApply();
    editor.surface.removeEventListener('focus', onFocus);
    return { invalidOpen, invalidMessage, readonlyClosed, readonlyRefused, imeRefused, replacementClosed, html: editor.getHTML(), open: form.isOpen() };
  });
  expect(result.invalidOpen).toBe(true);
  expect(result.invalidMessage).toContain('Unsupported');
  expect(result.readonlyClosed && result.readonlyRefused && result.imeRefused && result.replacementClosed).toBe(true);
  expect(result.html).toBe('<p>focus replacement</p>');
  expect(result.open).toBe(false);
});

test('form target editing cannot leak to another instance and editor destruction removes owned UI', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { editor, commands, form, host, viewHost } = window.formulaProbe;
    commands.insert('x');
    const formula = editor.surface.querySelector('span')!;
    const path = '/packages/plugins/dist/formula.js';
    const { formulas, formulaCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/formula');
    const secondHost = document.createElement('section');
    document.body.append(secondHost);
    const second = window.createEditor(secondHost, { value: '<p>other</p>', plugins: [formulas()] });
    second.setSelection(0);
    const foreign = formulaCommands(second).remove(formula);
    form.open(formula);
    editor.destroy();
    const closed = !form.isOpen() && !form.element.isConnected;
    const empty = !host.childElementCount && !viewHost.childElementCount;
    form.destroy();
    const secondHTML = second.getHTML();
    second.destroy();
    secondHost.remove();
    return { foreign, closed, empty, secondHTML };
  });
  expect(result).toEqual({ foreign: false, closed: true, empty: true, secondHTML: '<p>other</p>' });
});
