import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { MarkdownCommands, MarkdownShortcutOptions } from '@morfira-dev/wysiwyg/plugins/markdown';

declare global { interface Window { markdownAPI: MarkdownCommands; } }
const initialize = async (page: Page, html = '<p><br></p>', options: MarkdownShortcutOptions = {}) => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ value, settings }) => {
    window.dispose(); const host = document.createElement('div'); host.className = 'markdown-test'; document.body.append(host);
    window.editor = window.createEditor(host, { value, plugins: [window.createMarkdownShortcuts(settings)] });
    window.markdownAPI = window.markdownCommands(window.editor); window.changes = [];
    window.editor.subscribe((change) => window.changes.push(change)); window.editor.setSelection(window.editor.surface.textContent!.length);
  }, { value: html, settings: options });
};
const content = (page: Page) => page.locator('.markdown-test .mw-content');
const replace = (page: Page, html: string, index?: number) => page.evaluate(({ value, offset }) => {
  window.editor.setHTML(value); window.editor.setSelection(offset ?? window.editor.surface.textContent!.length); window.changes = [];
}, { value: html, offset: index });
const beforeInput = (page: Page, data: string | null, inputType = 'insertText', composing = false) => page.evaluate(({ text, type, isComposing }) => {
  const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: type, data: text, isComposing });
  window.editor.surface.dispatchEvent(event); return event.defaultPrevented;
}, { text: data, type: inputType, isComposing: composing });

const blockRules: [string, string][] = [
  ['#', 'h1'], ['##', 'h2'], ['###', 'h3'], ['####', 'h4'], ['#####', 'h5'], ['######', 'h6'],
  ['>', 'blockquote'], ['-', 'ul > li'], ['*', 'ul > li'], ['+', 'ul > li'], ['1.', 'ol > li'], ['1)', 'ol > li'], ['```', 'pre'],
];
test('every block marker converts on an actual space without leaving the trigger in the document', async ({ page }) => {
  await initialize(page);
  for (const [marker, selector] of blockRules) {
    await replace(page, `<p>${marker.replace(/>/g, '&gt;')}</p>`); await page.keyboard.press('Space');
    await expect(content(page).locator(`:scope > ${selector}`)).toHaveCount(1);
    expect(await page.evaluate(() => window.editor.surface.textContent)).toBe('');
    expect(await page.evaluate(() => window.changes.length)).toBe(1);
    await page.keyboard.type('Title'); await expect(content(page).locator(selector)).toHaveText('Title');
  }
});

test('block conversion keeps rich suffix, paragraph style and the actual insertion point', async ({ page }) => {
  await initialize(page, '<p style="text-align: center">##<em>Tail</em></p>');
  await page.evaluate(() => window.editor.setSelection(2)); await page.keyboard.press('Space');
  await expect(content(page).locator('h2')).toHaveAttribute('style', /text-align: center/);
  await expect(content(page).locator('h2 em')).toHaveText('Tail');
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 0, length: 0 });
  await page.keyboard.type('New '); await expect(content(page).locator('h2')).toHaveText('New Tail');
});

test('space block conversion is one undo step restoring the pre-trigger literal document and caret', async ({ page }) => {
  await initialize(page, '<p>##<strong>Tail</strong></p>'); await page.evaluate(() => window.editor.setSelection(2));
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.keyboard.press('Space'); await expect(content(page).locator('h2')).toHaveText('Tail');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo()); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 2, length: 0 });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo()); await expect(content(page).locator('h2 strong')).toHaveText('Tail');
});

test('horizontal-rule markers retain suffix and provide a following typing paragraph', async ({ page }) => {
  await initialize(page);
  for (const marker of ['---', '***', '___']) {
    await replace(page, `<p>${marker}<em>Tail</em></p>`, 3); await page.keyboard.press('Space');
    await expect(content(page).locator(':scope > hr')).toHaveCount(1); await expect(content(page).locator(':scope > p em')).toHaveText('Tail');
    await page.keyboard.type('New '); await expect(content(page).locator('p')).toHaveText('New Tail');
  }
  await replace(page, '<p>---</p>'); await page.keyboard.press('Space');
  await expect(content(page).locator(':scope > hr + p')).toHaveCount(1);
  await page.keyboard.type('After'); await expect(content(page).locator('p')).toHaveText('After');
});

test('Enter converts only a complete code fence or horizontal marker', async ({ page }) => {
  await initialize(page);
  for (const [marker, selector] of [['```', 'pre'], ['---', 'hr'], ['***', 'hr'], ['___', 'hr']]) {
    await replace(page, `<p>${marker}</p>`); await page.keyboard.press('Enter');
    await expect(content(page).locator(`:scope > ${selector}`)).toHaveCount(1);
    await page.evaluate(() => window.editor.undo()); await expect(content(page).locator('p')).toHaveText(marker);
    expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: marker.length, length: 0 });
  }
  await replace(page, '<p>```Tail</p>', 3); expect(await beforeInput(page, null, 'insertParagraph')).toBe(false);
  await expect(content(page).locator('pre')).toHaveCount(0);
  await replace(page, '<p>#</p>'); expect(await beforeInput(page, null, 'insertParagraph')).toBe(false);
});

const inlineRules: [string, string, string][] = [
  ['**Bold*', '*', 'strong'], ['__Bold_', '_', 'strong'], ['*Italic', '*', 'em'], ['_Italic', '_', 'em'], ['~~Strike~', '~', 's'], ['`Code', '`', 'code'],
];
test('all inline rules produce semantic content and subsequent typing stays outside the new mark', async ({ page }) => {
  await initialize(page);
  for (const [literal, trigger, selector] of inlineRules) {
    await replace(page, `<p>${literal}</p>`); await page.keyboard.type(trigger);
    await expect(content(page).locator(selector)).toHaveCount(1);
    const body = literal.replace(/^[*_~`]+/, '').replace(/[*_~`]+$/, '');
    await expect(content(page).locator(selector)).toHaveText(body);
    await page.keyboard.type(' after'); await expect(content(page).locator(selector)).toHaveText(body);
    await expect(content(page).locator('p')).toHaveText(`${body} after`);
    expect(await page.evaluate(() => window.editor.surface.textContent!.includes('\u200b'))).toBe(false);
  }
});

test('inline conversion across text nodes keeps nested formatting and rich suffix', async ({ page }) => {
  await initialize(page, '<p>Before **<em>bo</em>ld*<u>Tail</u></p>');
  // The caret is before Tail: Before(7) + **(2) + bold(4) + *(1) = 14 UTF-16 units.
  await page.evaluate(() => window.editor.setSelection(14)); await page.keyboard.type('*');
  await expect(content(page).locator('strong')).toHaveText('bold'); await expect(content(page).locator('strong em')).toHaveText('bo');
  await expect(content(page).locator('u')).toHaveText('Tail'); await expect(content(page).locator('p')).toHaveText('Before boldTail');
  await page.keyboard.type('!'); await expect(content(page).locator('strong')).toHaveText('bold'); await expect(content(page).locator('p')).toHaveText('Before bold!Tail');
});

test('inline conversion has one user change and undo restores the incomplete pre-trigger marker', async ({ page }) => {
  await initialize(page, '<p>**bold*</p>'); const before = await page.evaluate(() => window.editor.getHTML());
  await page.keyboard.type('*'); await expect(content(page).locator('strong')).toHaveText('bold');
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo()); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: 7, length: 0 });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => window.editor.redo()); await expect(content(page).locator('strong')).toHaveText('bold');
  await page.keyboard.type('!'); await expect(content(page).locator('strong')).toHaveText('bold'); await expect(content(page).locator('p')).toHaveText('bold!');
});

test('block and inline shortcuts preserve merged-table cells and unrelated content', async ({ page }) => {
  await initialize(page, '<table><tbody><tr><td rowspan="2"><p>##</p></td><td>A</td></tr><tr><td>B</td></tr></tbody></table><p>Tail</p>');
  await page.evaluate(() => window.editor.setSelection(2)); await page.keyboard.press('Space');
  await expect(content(page).locator('td[rowspan="2"] h2')).toHaveCount(1); await expect(content(page).locator('td')).toHaveCount(3);
  await page.keyboard.type('Cell'); await expect(content(page).locator('td[rowspan="2"] h2')).toHaveText('Cell'); await expect(content(page).locator(':scope > p')).toHaveText('Tail');
  await replace(page, '<table><tbody><tr><td colspan="2"><p>**cell*</p></td></tr><tr><td>A</td><td>B</td></tr></tbody></table>', 7);
  await page.keyboard.type('*'); await expect(content(page).locator('td[colspan="2"] strong')).toHaveText('cell'); await expect(content(page).locator('td')).toHaveCount(3);
});

test('escaping, identifiers, triple delimiters, empty and whitespace bodies remain literal', async ({ page }) => {
  await initialize(page);
  for (const [literal, trigger] of [['\\**word*', '*'], ['name_word', '_'], ['***word**', '*'], ['** word*', '*'], ['**word *', '*'], ['**', '*'], ['~~', '~'], ['`', '`'], ['А_слово', '_']]) {
    await replace(page, `<p>${literal}</p>`); expect(await beforeInput(page, trigger)).toBe(false);
    expect(await page.evaluate(() => window.editor.surface.textContent)).toBe(literal); await expect(content(page).locator('strong,em,s,code')).toHaveCount(0);
  }
  await replace(page, '<p>_wordTail</p>', 5); expect(await beforeInput(page, '_')).toBe(false);
  await replace(page, '<p>2.</p>'); expect(await beforeInput(page, ' ')).toBe(false);
  await replace(page, '<p>```ts</p>'); expect(await beforeInput(page, ' ')).toBe(false);
});

test('anchors, code, figures, captions, existing matching formats and atomic barriers stay literal', async ({ page }) => {
  await initialize(page);
  const cases = [
    ['<p><a href="/keep">**word*</a></p>', '*'], ['<p><code>**word*</code></p>', '*'], ['<pre>**word*</pre>', '*'],
    ['<figure><img src="/logo.svg"><figcaption>**word*</figcaption></figure>', '*'], ['<p><strong>**word*</strong></p>', '*'],
    ['<p>**wo<br>rd*</p>', '*'], ['<p>**wo<img src="/logo.svg">rd*</p>', '*'], ['<p>**wo<a href="/keep">rd</a>*</p>', '*'],
    ['<ul><li><p>#</p></li></ul>', ' '], ['<blockquote><p>#</p></blockquote>', ' '], ['<p><a href="/keep">#</a></p>', ' '],
  ];
  for (const [html, trigger] of cases) { await replace(page, html); const before = await page.evaluate(() => window.editor.getHTML()); expect(await beforeInput(page, trigger)).toBe(false); expect(await page.evaluate(() => window.editor.getHTML())).toBe(before); }
});

test('disabled options and runtime toggle preserve literal input without changing history', async ({ page }) => {
  await initialize(page, '<p>#</p>', { enabled: false }); await page.keyboard.press('Space'); await expect(content(page).locator('p')).toHaveText('# '); await expect(content(page).locator('h1')).toHaveCount(0);
  await page.evaluate(() => { window.editor.setHTML('<p>#</p>'); window.editor.setSelection(1); window.markdownAPI.setEnabled(true); });
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false); await page.keyboard.press('Space'); await expect(content(page).locator('h1')).toHaveCount(1);
  await initialize(page, '<p>#</p>', { blocks: false }); expect(await beforeInput(page, ' ')).toBe(false);
  await initialize(page, '<p>**word*</p>', { inline: false }); expect(await beforeInput(page, '*')).toBe(false);
});

test('noncollapsed selections, read-only and composition do not run shortcuts', async ({ page }) => {
  await initialize(page, '<p>#</p>'); await page.evaluate(() => window.editor.setSelection(0, 1)); expect(await beforeInput(page, ' ')).toBe(false);
  await page.evaluate(() => { window.editor.setSelection(1); window.editor.setReadOnly(true); }); expect(await beforeInput(page, ' ')).toBe(true); await expect(content(page).locator('h1')).toHaveCount(0);
  await page.evaluate(() => { window.editor.setReadOnly(false); window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
  expect(await beforeInput(page, ' ')).toBe(false); await expect(content(page).locator('h1')).toHaveCount(0);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))); await expect(content(page).locator('h1')).toHaveCount(0);
  expect(await beforeInput(page, ' ', 'insertText', true)).toBe(false);
  expect(await beforeInput(page, ' ', 'insertCompositionText')).toBe(false);
});

test('external HTML/JSON, paste and multi-character text never auto-convert', async ({ page }) => {
  await initialize(page); await replace(page, '<p># </p><p>**bold**</p>'); await expect(content(page).locator('h1,strong')).toHaveCount(0);
  await page.evaluate(() => window.editor.setJSON(window.editor.getJSON())); await expect(content(page).locator('h1,strong')).toHaveCount(0);
  await replace(page, '<p><br></p>'); await page.evaluate(() => window.editor.insertHTML('<p>**bold**</p>')); await expect(content(page).locator('strong')).toHaveCount(0);
  await replace(page, '<p>#</p>'); expect(await beforeInput(page, '  ')).toBe(false); expect(await beforeInput(page, ' ', 'insertFromPaste')).toBe(false);
  await page.evaluate(() => { const transfer = new DataTransfer(); transfer.setData('text/plain', '**pasted**'); window.editor.surface.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })); });
  await expect(content(page).locator('strong')).toHaveCount(0);
});

test('a prior capture listener can cancel input before Markdown sees it', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('textbox')).toBeVisible();
  expect(await page.evaluate(() => {
    window.dispose(); const host = document.createElement('div'); document.body.append(host);
    window.editor = window.createEditor(host, { value: '<p>#</p>', plugins: [{ name: 'cancel-input', setup: (editor) => { const cancel = (event: InputEvent) => event.preventDefault(); editor.surface.addEventListener('beforeinput', cancel, true); return () => editor.surface.removeEventListener('beforeinput', cancel, true); } }, window.createMarkdownShortcuts()] }); window.editor.setSelection(1);
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }); window.editor.surface.dispatchEvent(event);
    const result = window.editor.surface.querySelector('h1') === null && window.editor.getHTML() === '<p>#</p>'; window.editor.destroy(); host.remove(); return result;
  })).toBe(true);
});

test('inline matching accepts the 2000-unit body cap but ignores oversized bodies and long plain prefixes', async ({ page }) => {
  await initialize(page, `<p>**${'a'.repeat(2000)}*</p>`); await page.keyboard.type('*'); await expect(content(page).locator('strong')).toHaveText('a'.repeat(2000));
  await replace(page, `<p>**${'a'.repeat(2001)}*</p>`); expect(await beforeInput(page, '*')).toBe(false); await expect(content(page).locator('strong')).toHaveCount(0);
  await replace(page, `<p>${'a'.repeat(20000)}#</p>`); expect(await beforeInput(page, ' ')).toBe(false);
});

test('instance options are copied, state snapshots independent and disposed APIs/listeners do not survive', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const options = { enabled: true, blocks: true, inline: true }; const plugin = window.createMarkdownShortcuts(options); options.enabled = false; options.blocks = false;
    const hosts = [document.createElement('div'), document.createElement('div')]; hosts.forEach((host) => document.body.append(host));
    const first = window.createEditor(hosts[0], { value: '<p>#</p>', plugins: [plugin] }); const second = window.createEditor(hosts[1], { value: '<p>#</p>', plugins: [plugin] });
    const a = window.markdownCommands(first); const b = window.markdownCommands(second); const state = a.getState(); state.enabled = false; const independent = a.getState().enabled;
    a.setEnabled(false); second.setSelection(1); second.surface.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }));
    const converted = second.surface.querySelector('h1') !== null && b.getState().enabled && !a.getState().enabled;
    const detached = first.surface; first.destroy(); let throws = false; try { a.setEnabled(true); } catch { throws = true; }
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }); detached.dispatchEvent(event);
    const result = independent && converted && throws && !event.defaultPrevented; second.destroy(); hosts.forEach((host) => host.remove()); return result;
  })).toBe(true);
});

test('invalid options and runtime values reject atomically and SSR import/factory need no DOM', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    let rejected = 0; for (const value of [null, [], { enabled: 'yes' }, { blocks: 1 }, { inline: null }]) { try { window.createMarkdownShortcuts(value as never); } catch { rejected++; } }
    try { window.markdownAPI.setEnabled('yes' as never); } catch { rejected++; }
    return rejected === 6 && window.markdownAPI.getState().enabled && !window.editor.canUndo();
  })).toBe(true);
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', 'const { markdownShortcuts } = await import("@morfira-dev/wysiwyg/plugins/markdown"); process.stdout.write(String(typeof markdownShortcuts().setup === "function"));'], { cwd: process.cwd(), encoding: 'utf8' });
  expect(output).toBe('true');
});


test('even escaped prefixes may convert while preserving the literal backslashes', async ({ page }) => {
  const prefix = '\\'.repeat(2); await initialize(page, `<p>${prefix}**word*</p>`); await page.keyboard.type('*');
  await expect(content(page).locator('strong')).toHaveText('word'); await expect(content(page).locator('p')).toHaveText(`${prefix}word`);
});

test('typed HTML-looking content remains literal text inside the semantic mark', async ({ page }) => {
  await initialize(page); await page.keyboard.type('**<b>safe</b>**');
  await expect(content(page).locator('strong')).toHaveText('<b>safe</b>'); await expect(content(page).locator('strong > *')).toHaveCount(0);
});

test('an unmatched inline-code opener keeps inner Markdown literal until its closing backtick', async ({ page }) => {
  await initialize(page); await page.keyboard.type('`**x**');
  await expect(content(page).locator('strong')).toHaveCount(0); await expect(content(page).locator('p')).toHaveText('`**x**');
  await page.keyboard.type('`'); await expect(content(page).locator('code')).toHaveText('**x**'); await expect(content(page).locator('strong')).toHaveCount(0);
  await page.keyboard.type(' after'); await expect(content(page).locator('code')).toHaveText('**x**'); await expect(content(page).locator('p')).toHaveText('**x** after');
});

test('an escaped backtick remains literal and does not suppress a later bold shortcut', async ({ page }) => {
  await initialize(page); const escaped = String.fromCharCode(92) + '`'; await page.keyboard.type(`${escaped}**bold**`);
  await expect(content(page).locator('strong')).toHaveText('bold'); await expect(content(page).locator('code')).toHaveCount(0);
  await expect(content(page).locator('p')).toHaveText(`${escaped}bold`);
});
