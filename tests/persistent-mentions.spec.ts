import { expect, test } from '@playwright/test';
import { initializePersistentMention, mentionHTML, persistentMentionContent, readyPersistentMention } from './persistent-mentions.fixture.js';
import './persistent-mentions.types.js';

test('persistent choice keeps the opaque ID, starting marks, native typing outside and one-step selection history', async ({ page }) => {
  const original = '<p>Before <strong>@a</strong><em> tail</em></p>';
  await initializePersistentMention(page, original);
  await page.evaluate(() => window.editor.setSelection(9));
  await readyPersistentMention(page);
  expect(await page.evaluate(() => window.persistentMentionAPI.choose('person-42'))).toBe(true);
  const content = persistentMentionContent(page);
  await expect(content.locator('strong > [data-mw-node="morfira:mention"]')).toHaveText('@Anna');
  expect(await page.evaluate(() => window.persistentMentionModule.getMentions(window.editor))).toEqual([{ id: 'person-42', text: '@Anna' }]);
  expect(await page.evaluate(() => {
    const native = document.getSelection()!.getRangeAt(0);
    return { selection: window.editor.getSelection(), inside: native.startContainer.parentElement?.closest('[data-mw-node="morfira:mention"]') !== null, changes: window.changes.filter((change) => change.source === 'user').length };
  })).toEqual({ selection: { index: 13, length: 0 }, inside: false, changes: 1 });
  const chosen = await page.evaluate(() => window.editor.getHTML());
  await page.keyboard.insertText('next');
  await expect(content.locator('[data-mention-id]')).toHaveText('@Anna');
  await expect(content).toHaveText('Before @Anna next tail');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(chosen);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection() }))).toEqual({ html: original, selection: { index: 9, length: 0 } });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), state: window.persistentMentionAPI.getState().status, calls: window.persistentMentionCalls }))).toEqual({ html: chosen, state: 'closed', calls: 1 });
});

test('default mentions remain plain text while opted-in initial HTML and JSON preserve independent reference snapshots', async ({ page }) => {
  await initializePersistentMention(page, '<p>@a</p>', { persistent: false });
  await readyPersistentMention(page);
  await page.evaluate(() => window.persistentMentionAPI.choose('person-42'));
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), references: window.persistentMentionModule.getMentions(window.editor) }))).toEqual({ html: '<p>@Anna </p>', references: [] });
  await initializePersistentMention(page, `<p>${mentionHTML} and ${mentionHTML}</p>`);
  expect(await page.evaluate(() => {
    const { getMentions, createMentionSchema } = window.persistentMentionModule;
    const before = window.editor.getJSON();
    const records = getMentions(window.editor);
    records[0].id = 'mutated';
    records[1].text = 'changed';
    window.editor.setHTML('<p>Other</p>');
    window.editor.setJSON(before);
    const first = createMentionSchema();
    const second = createMentionSchema();
    return { references: getMentions(window.editor), html: window.editor.getHTML(), definitionsIndependent: first !== second && first.attributes !== second.attributes };
  })).toEqual({ references: [{ id: 'person-42', text: '@Anna' }, { id: 'person-42', text: '@Anna' }], html: `<p>${mentionHTML} and ${mentionHTML}</p>`, definitionsIndependent: true });
  // This slice is deliberately editable; changing the label does not change identity.
  await persistentMentionContent(page).locator('[data-mention-id]').first().evaluate((span) => {
    const native = document.getSelection()!;
    window.editor.surface.focus();
    native.setBaseAndExtent(span.firstChild!, 5, span.firstChild!, 5);
  });
  await page.keyboard.insertText('!');
  expect(await page.evaluate(() => window.persistentMentionModule.getMentions(window.editor)[0])).toEqual({ id: 'person-42', text: '@Anna!' });
});

test('table copy and actual paste retain mention metadata across merged cells and Markdown refuses identity loss', async ({ page }) => {
  await initializePersistentMention(page, `<table><tr><td colspan="2"><p>${mentionHTML}</p></td></tr></table><p>End</p>`, { tables: true });
  const copied = await page.evaluate(() => {
    const cell = window.editor.surface.querySelector('td')!;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    window.editor.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 0, column: 1 });
    return window.tableCommands(window.editor).copy();
  });
  expect(copied.html).toContain('data-mention-id="person-42"');
  expect(copied.text).toBe('@Anna\t');
  await page.evaluate((copied) => {
    window.editor.setHTML('<table><tr><td>A</td><td>B</td></tr></table><p>End</p>');
    const cell = window.editor.surface.querySelector('td')!;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    window.editor.focus();
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    window.tableCommands(window.editor).select({ row: 0, column: 0 }, { row: 0, column: 1 });
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', copied.html);
    clipboardData.setData('text/plain', copied.text);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    window.editor.surface.dispatchEvent(event);
  }, copied);
  await expect(persistentMentionContent(page).locator('td[colspan="2"]')).toHaveText('@Anna');
  expect(await page.evaluate(() => window.persistentMentionModule.getMentions(window.editor))).toEqual([{ id: 'person-42', text: '@Anna' }]);
  expect(await page.evaluate(async () => {
    const path = '/packages/wysiwyg/dist/codecs/markdown.js';
    const { serializeMarkdown } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/codecs/markdown');
    try { serializeMarkdown(window.editor.getJSON()); return false; }
    catch (error) { return error instanceof TypeError; }
  })).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table><p>End</p>');
});

test('literal provider labels and IDs cannot inject markup, and malformed imported IDs reject atomically', async ({ page }) => {
  await initializePersistentMention(page);
  const id = 'person"><img src=x onerror=alert(1)>';
  await page.evaluate((id) => { window.persistentMentionPeople = [{ id, label: '<img src=x onerror=alert(1)>' }]; }, id);
  await readyPersistentMention(page);
  await page.evaluate((id) => window.persistentMentionAPI.choose(id), id);
  await expect(persistentMentionContent(page).locator('img,script')).toHaveCount(0);
  expect(await page.evaluate(() => window.persistentMentionModule.getMentions(window.editor))).toEqual([{ id, text: '@<img src=x onerror=alert(1)>' }]);
  expect(await page.evaluate(() => {
    const editor = window.editor;
    editor.setSelection(editor.surface.textContent!.length);
    editor.insertHTML('X');
    editor.undo();
    const before = { html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    const failures: boolean[] = [];
    for (const id of ['', 'x'.repeat(257), 'a\nb', 'a\u007fb', 'a\u2028b', 'a\u2029b']) {
      for (const source of ['html', 'json'] as const) {
        try {
          if (source === 'html') {
            const template = document.createElement('template');
            const span = document.createElement('span');
            span.setAttribute('data-mw-node', 'morfira:mention');
            span.setAttribute('data-mention-id', id);
            span.textContent = '@Invalid';
            template.content.append(span);
            editor.setHTML(template.innerHTML);
          }
          else editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'span', attributes: { 'data-mw-node': 'morfira:mention', 'data-mention-id': id }, children: [{ type: 'text', text: '@Invalid' }] }] });
          failures.push(false);
        }
        catch { failures.push(true); }
      }
    }
    for (const action of [
      () => editor.setHTML('<span data-mw-node="morfira:mention">Missing</span>'),
      () => editor.setJSON({ version: 1, children: [{ type: 'element', tag: 'span', attributes: { 'data-mw-node': 'morfira:mention' }, children: [] }] }),
    ]) {
      try { action(); failures.push(false); } catch { failures.push(true); }
    }
    const after = { html: editor.getHTML(), selection: editor.getSelection(), undo: editor.canUndo(), redo: editor.canRedo(), changes: window.changes.length };
    return { failures, unchanged: JSON.stringify(before) === JSON.stringify(after) };
  })).toEqual({ failures: Array(14).fill(true), unchanged: true });
});

test('semantic reference boundaries stop suggestion detection and search while offsets and visible statistics stay correct', async ({ page }) => {
  await initializePersistentMention(page, `<p>${mentionHTML}</p>`);
  expect(await page.evaluate(() => {
    window.editor.setSelection(3);
    const inside = window.persistentMentionAPI.open();
    window.editor.setHTML('<p><span data-mw-node="morfira:mention" data-mention-id="person-42">@</span>anna</p>');
    window.editor.setSelection(5);
    return { inside, across: window.persistentMentionAPI.open() };
  })).toEqual({ inside: false, across: false });
  const result = await page.evaluate(async (mentionHTML) => {
    const searchPath = '/packages/wysiwyg/dist/plugins/search.js';
    const statsPath = '/packages/wysiwyg/dist/plugins/statistics.js';
    const { search, searchCommands } = await import(/* @vite-ignore */ searchPath) as typeof import('@morfira-dev/wysiwyg/plugins/search');
    const { statistics, statisticsCommands } = await import(/* @vite-ignore */ statsPath) as typeof import('@morfira-dev/wysiwyg/plugins/statistics');
    const host = document.createElement('div');
    document.body.append(host);
    const original = `<p>Start ${mentionHTML} tail tail</p>`;
    const editor = window.createEditor(host, { value: original, plugins: [window.persistentMentionModule.mentions({ persistent: true, provide: () => [] }), search(), statistics()] });
    try {
      const api = searchCommands(editor);
      api.setQuery('Anna');
      const inside = api.getState().matches.length;
      api.setQuery('Anna tail');
      const across = api.getState().matches.length;
      api.setQuery('tail');
      const matches = api.getState().matches;
      const characters = statisticsCommands(editor).getState().document.characters;
      const replaced = api.replaceAll('end');
      const references = window.persistentMentionModule.getMentions(editor);
      const text = editor.getText();
      editor.undo();
      return { inside, across, matches, characters, replaced, references, text, undo: editor.getHTML() === original };
    }
    finally { editor.destroy(); host.remove(); }
  }, mentionHTML);
  expect(result).toEqual({ inside: 0, across: 0, matches: [{ index: 12, length: 4, text: 'tail' }, { index: 17, length: 4, text: 'tail' }], characters: 21, replaced: 2, references: [{ id: 'person-42', text: '@Anna' }], text: 'Start @Anna end end', undo: true });
});

test('deferred persistent choices are canceled by readonly, composition and disposal without changing the literal query', async ({ page }) => {
  await initializePersistentMention(page, '<p>@a</p>', { deferred: true });
  expect(await page.evaluate(() => window.persistentMentionAPI.open())).toBe(true);
  await expect.poll(() => page.evaluate(() => window.persistentMentionRequests.length)).toBe(1);
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.persistentMentionRequests[0].resolve([{ id: 'late', label: 'Late' }]);
  });
  expect(await page.evaluate(() => ({ aborted: window.persistentMentionRequests[0].signal.aborted, choice: window.persistentMentionAPI.choose('late'), html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ aborted: true, choice: false, html: '<p>@a</p>', undo: false });
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.setSelection(2); window.persistentMentionAPI.open(); });
  await expect.poll(() => page.evaluate(() => window.persistentMentionRequests.length)).toBe(2);
  await page.evaluate(() => {
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.persistentMentionRequests[1].resolve([{ id: 'late', label: 'Late' }]);
  });
  expect(await page.evaluate(() => ({ aborted: window.persistentMentionRequests[1].signal.aborted, choice: window.persistentMentionAPI.choose('late'), html: window.editor.getHTML() }))).toEqual({ aborted: true, choice: false, html: '<p>@a</p>' });
  expect(await page.evaluate(() => {
    const api = window.persistentMentionAPI;
    const editor = window.editor;
    editor.destroy();
    const failures: boolean[] = [];
    for (const action of [() => api.choose('late'), () => window.persistentMentionModule.getMentions(editor)]) {
      try { action(); failures.push(false); } catch { failures.push(true); }
    }
    return failures;
  })).toEqual([true, true]);
});

test('SDK text constraints reject malformed definitions while legacy empty and multiline values stay compatible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  const result = await page.evaluate(() => {
    const strict = window.createEditor;
    const make = (rule: import('@morfira-dev/wysiwyg').SchemaAttributeSpec) => {
      const host = document.createElement('div');
      document.body.append(host);
      try {
        const editor = strict(host, { schema: [{ name: 'test:text-rule', kind: 'inline', tag: 'span', attributes: { 'data-value': rule } }] });
        return { editor, host };
      }
      catch (error) { host.remove(); throw error; }
    };
    const { editor, host } = make({ type: 'text', minLength: 1, maxLength: 3, singleLine: true, required: true });
    const valid: string[] = [];
    const invalid: boolean[] = [];
    try {
      for (const value of ['x', 'abc']) {
        const json = editor.schema.validateDocument({ version: 1, children: [{ type: 'element', tag: 'span', attributes: { 'data-mw-node': 'test:text-rule', 'data-value': value }, children: [] }] });
        valid.push(editor.schema.documentHTML(json));
      }
      for (const value of ['', 'abcd', 'a\nb', 'a\u007fb', 'a\u2028b', 'a\u2029b']) {
        try { editor.schema.validateDocument({ version: 1, children: [{ type: 'element', tag: 'span', attributes: { 'data-mw-node': 'test:text-rule', 'data-value': value }, children: [] }] }); invalid.push(false); }
        catch { invalid.push(true); }
      }
    }
    finally { editor.destroy(); host.remove(); }
    const malformed: boolean[] = [];
    for (const rule of [
      { type: 'text', minLength: -1 }, { type: 'text', minLength: 2, maxLength: 1 },
      { type: 'text', minLength: 1.5 }, { type: 'text', minLength: null },
      { type: 'text', singleLine: 'yes' }, { type: 'text', singleLine: null },
    ]) {
      try {
        const { editor, host } = make(rule as import('@morfira-dev/wysiwyg').SchemaAttributeSpec);
        editor.destroy(); host.remove(); malformed.push(false);
      }
      catch { malformed.push(true); }
    }
    const legacy = make({ type: 'text', maxLength: 3 });
    try {
      const legacyValues = ['', '\n'].map((value) => {
        const json = legacy.editor.schema.validateDocument({ version: 1, children: [{ type: 'element', tag: 'span', attributes: { 'data-mw-node': 'test:text-rule', 'data-value': value }, children: [] }] });
        const node = json.children[0];
        if (node.type !== 'element') throw new Error('Expected an element');
        return node.attributes['data-value'];
      });
      return { valid, invalid, malformed, legacy: legacyValues };
    }
    finally { legacy.editor.destroy(); legacy.host.remove(); }
  });
  expect(result).toEqual({ valid: ['<span data-mw-node="test:text-rule" data-value="x"></span>', '<span data-mw-node="test:text-rule" data-value="abc"></span>'], invalid: Array(6).fill(true), malformed: Array(6).fill(true), legacy: ['', '\n'] });
});

test('one persistent plugin object has independent references and controllers across editor lifecycles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async () => {
    const path = '/packages/wysiwyg/dist/plugins/mentions.js';
    window.persistentMentionModule = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/mentions');
    window.dispose();
    const firstHost = document.createElement('div');
    const secondHost = document.createElement('div');
    document.body.append(firstHost, secondHost);
    const plugin = window.persistentMentionModule.mentions({ persistent: true, debounceMs: 0, provide: ({ query }) => [{ id: query, label: query === 'a' ? 'Anna' : 'Bob' }] });
    window.editor = window.createEditor(firstHost, { value: '<p>@a</p>', plugins: [plugin] });
    window.persistentMentionSecondEditor = window.createEditor(secondHost, { value: '<p>@b</p>', plugins: [plugin] });
    window.persistentMentionAPI = window.persistentMentionModule.mentionCommands(window.editor);
    window.persistentMentionSecondAPI = window.persistentMentionModule.mentionCommands(window.persistentMentionSecondEditor);
    window.dispose = () => { window.editor.destroy(); window.persistentMentionSecondEditor.destroy(); firstHost.remove(); secondHost.remove(); };
    window.editor.setSelection(2);
    window.persistentMentionAPI.open();
  });
  await expect.poll(() => page.evaluate(() => window.persistentMentionAPI.getState().status)).toBe('ready');
  expect(await page.evaluate(() => {
    const chosen = window.persistentMentionAPI.choose('a');
    window.persistentMentionSecondEditor.setSelection(2);
    window.persistentMentionSecondAPI.open();
    return { chosen, references: window.persistentMentionModule.getMentions(window.editor), second: window.persistentMentionModule.getMentions(window.persistentMentionSecondEditor) };
  })).toEqual({ chosen: true, references: [{ id: 'a', text: '@Anna' }], second: [] });
  await expect.poll(() => page.evaluate(() => window.persistentMentionSecondAPI.getState().status)).toBe('ready');
  expect(await page.evaluate(() => {
    window.editor.destroy();
    const chosen = window.persistentMentionSecondAPI.choose('b');
    return { chosen, references: window.persistentMentionModule.getMentions(window.persistentMentionSecondEditor), text: window.persistentMentionSecondEditor.surface.textContent, undo: window.persistentMentionSecondEditor.canUndo() };
  })).toEqual({ chosen: true, references: [{ id: 'b', text: '@Bob' }], text: '@Bob ', undo: true });
});
