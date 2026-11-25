import { expect, test } from '@playwright/test';
import type {} from '../playground/application-extensions/types.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/playground/application-extensions.html');
  await expect.poll(() => page.evaluate(() => typeof window.applicationExtensionFixture?.createApplicationExtensions)).toBe('function');
});

test('entity, callout and variable commands preserve metadata, one-step history and independent published content', async ({ page }) => {
  const results = await page.evaluate(() => {
    const api = window.applicationExtensionFixture;
    const configurations = [
      { kind: 'entity', attributes: { 'data-id': '42' }, changed: { 'data-id': '43' } },
      { kind: 'callout', attributes: { 'data-tone': 'info' }, changed: { 'data-tone': 'warning' } },
      { kind: 'variable', attributes: { 'data-key': 'customer' }, changed: { 'data-key': 'order' } },
    ] as const;
    return configurations.map(({ kind, attributes, changed }) => {
      const host = document.createElement('div');
      const viewHost = document.createElement('div');
      document.body.append(host, viewHost);
      const bundle = api.createApplicationExtensions();
      const editor = api.createEditor(host, { value: '<p>AB</p>', plugins: bundle.plugins });
      editor.setSelection(1);
      const inserted = bundle.commands(editor, kind).insert('Initial', attributes);
      const insertedHTML = editor.getHTML();
      const node = editor.surface.querySelector<HTMLElement>('[data-mw-node]')!;
      const target = bundle.capture(editor, kind, node)!;
      const updated = bundle.update(target, 'Updated', changed);
      const updatedHTML = editor.getHTML();
      editor.undo();
      const undoUpdate = editor.getHTML() === insertedHTML;
      editor.redo();
      const redoUpdate = editor.getHTML() === updatedHTML;
      const currentNode = editor.surface.querySelector<HTMLElement>('[data-mw-node]')!;
      const removed = bundle.remove(bundle.capture(editor, kind, currentNode)!);
      const absent = !editor.surface.querySelector('[data-mw-node]');
      editor.undo();
      const undoRemove = editor.getHTML() === updatedHTML;
      const saved = JSON.parse(JSON.stringify(editor.getJSON()));
      const view = api.createContentView(viewHost, { value: saved, schema: bundle.schema });
      const retained = JSON.stringify(view.getJSON()) === JSON.stringify(saved);
      const literal = view.element.textContent?.includes('Updated');
      const noEditor = !view.element.querySelector('[contenteditable],.mw-editor');
      editor.setHTML('<p>Other</p>');
      editor.setJSON(saved);
      const reloaded = editor.getHTML() === updatedHTML;
      const readerIndependent = view.element.textContent?.includes('Updated');
      view.destroy(); editor.destroy(); host.remove(); viewHost.remove();
      return { kind, inserted, updated, undoUpdate, redoUpdate, removed, absent, undoRemove, retained, literal, noEditor, reloaded, readerIndependent };
    });
  });
  for (const result of results) expect(result).toEqual({ kind: result.kind, inserted: true, updated: true, undoUpdate: true, redoUpdate: true, removed: true, absent: true, undoRemove: true, retained: true, literal: true, noEditor: true, reloaded: true, readerIndependent: true });
});

test('template values expand as bounded literal text in a detached copy and never infer unknown keys or schemas', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = window.applicationExtensionFixture;
    const host = document.createElement('div');
    const readerHost = document.createElement('div');
    document.body.append(host, readerHost);
    const bundle = api.createApplicationExtensions();
    const editor = api.createEditor(host, { value: '<p>Hello <span data-mw-node="app:variable" data-key="customer">{{customer}}</span>; order <span data-mw-node="app:variable" data-key="order">{{order}}</span>.</p>', plugins: bundle.plugins });
    const saved = editor.getJSON();
    const before = editor.getHTML();
    const expanded = bundle.expand(saved, { customer: '<img src=x onerror=alert(1)>', order: '42' });
    const view = api.createContentView(readerHost, { value: expanded.document, schema: bundle.schema });
    const literal = view.element.textContent;
    const noMarkup = !view.element.querySelector('img,script');
    const noVariables = !view.element.querySelector('[data-mw-node="app:variable"]');
    const missing = bundle.expand(saved, {});
    const inherited = bundle.expand(saved, Object.create({ customer: 'INHERITED' }));
    let unknown = false, long = false, resources = false, replacementBudget = false, control = false, schema = false;
    try { bundle.expand(saved, { constructor: 'No' } as never); } catch { unknown = true; }
    try { bundle.expand(saved, { customer: 'x'.repeat(2001) }); } catch { long = true; }
    const repeated = { version: 1, children: Array.from({ length: 101 }, () => saved.children[0]) } as typeof saved;
    try { bundle.expand(repeated, { customer: 'A' }); } catch { resources = true; }
    try { bundle.expand({ version: 1, children: Array.from({ length: 12 }, () => saved.children[0]) }, { customer: 'x'.repeat(2000) }); } catch { replacementBudget = true; }
    let rejectedControls = 0;
    for (const text of ['\u0000', '\u0085', '\n']) {
      try { bundle.expand(saved, { customer: text }); } catch { rejectedControls++; }
    }
    control = rejectedControls === 3;
    const emptyHost = document.createElement('div'); document.body.append(emptyHost);
    try { api.createContentView(emptyHost, { value: saved }); } catch { schema = true; }
    const inputUnchanged = editor.getHTML() === before && !editor.canUndo();
    const rejectsBeforeMount = emptyHost.childNodes.length === 0;
    view.destroy(); editor.destroy(); host.remove(); readerHost.remove(); emptyHost.remove();
    return { literal, noMarkup, noVariables, missing: missing.unresolved, inherited: inherited.unresolved, unknown, long, resources, replacementBudget, control, schema, inputUnchanged, rejectsBeforeMount };
  });
  expect(result).toEqual({ literal: 'Hello <img src=x onerror=alert(1)>; order 42.', noMarkup: true, noVariables: true, missing: ['customer', 'order'], inherited: ['customer', 'order'], unknown: true, long: true, resources: true, replacementBudget: true, control: true, schema: true, inputUnchanged: true, rejectsBeforeMount: true });
});

test('application drafts expire after content changes and preserve readonly, IME and per-editor ownership', async ({ page }) => {
  const result = await page.evaluate(() => {
    const api = window.applicationExtensionFixture;
    const host = document.createElement('div'); const second = document.createElement('div'); document.body.append(host, second);
    const bundle = api.createApplicationExtensions();
    const editor = api.createEditor(host, { value: '<p><span data-mw-node="app:entity" data-id="42">Ada</span> text</p>', plugins: bundle.plugins });
    const other = api.createEditor(second, { value: '<p>Other</p>', plugins: api.createApplicationExtensions().plugins });
    const node = editor.surface.querySelector<HTMLElement>('[data-mw-node]')!;
    const oldDraft = bundle.capture(editor, 'entity', node)!;
    const oldHTML = editor.getHTML();
    editor.transact((surface) => (surface.querySelector('p')!.lastChild as Text).appendData('x'));
    editor.transact((surface) => {
      const tail = surface.querySelector('p')!.lastChild as Text;
      tail.deleteData(tail.length - 1, 1);
    });
    const sameNode = editor.surface.querySelector('[data-mw-node]') === node;
    const equalHTMLExpired = editor.getHTML() === oldHTML && !bundle.isCurrent(oldDraft);
    const currentNode = editor.surface.querySelector<HTMLElement>('[data-mw-node]')!;
    const target = bundle.capture(editor, 'entity', currentNode)!;
    const foreign = bundle.capture(other, 'entity', node) === undefined;
    editor.setReadOnly(true);
    const before = editor.getHTML();
    const readOnly = !bundle.update(target, 'No', { 'data-id': '42' }) && editor.getHTML() === before;
    editor.setReadOnly(false);
    const compositionTarget = bundle.capture(editor, 'entity', currentNode)!;
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const composition = !bundle.update(compositionTarget, 'No', { 'data-id': '42' }) && editor.getHTML() === before;
    editor.setHTML('<p>Replacement</p>');
    const stale = !bundle.update(target, 'No', { 'data-id': '42' }) && !bundle.remove(target);
    const otherRetained = other.getHTML() === '<p>Other</p>';
    editor.destroy();
    const disposed = !bundle.isCurrent(target);
    other.destroy(); host.remove(); second.remove();
    return { sameNode, equalHTMLExpired, foreign, readOnly, composition, stale, otherRetained, disposed };
  });
  expect(result).toEqual({ sameNode: true, equalHTMLExpired: true, foreign: true, readOnly: true, composition: true, stale: true, otherRetained: true, disposed: true });
});
