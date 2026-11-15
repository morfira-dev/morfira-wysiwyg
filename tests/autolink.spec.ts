import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AutolinkCommands, AutolinkOptions } from '@morfira-dev/wysiwyg/plugins/autolink';

declare global { interface Window { autolinkAPI: AutolinkCommands; } }

const initialize = async (page: Page, html = '<p><br></p>', options: AutolinkOptions = {}, semantic = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ html, options, semantic }) => {
    const modulePath = '/packages/plugins/dist/autolink.js';
    const { autolink, autolinkCommands } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/plugins/autolink');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'autolink-test';
    document.body.append(host);
    window.editor = window.createEditor(host, {
      value: html,
      plugins: [autolink(options)],
      schema: semantic ? [
        { name: 'test:note', kind: 'block', tag: 'blockquote', attributes: { 'data-tone': { type: 'enum', values: ['note'], required: true } } },
        { name: 'test:reference', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } },
      ] : [],
    });
    window.autolinkAPI = autolinkCommands(window.editor);
    window.changes = [];
    window.editor.subscribe((change) => window.changes.push(change));
    window.editor.setSelection(window.editor.surface.textContent!.length);
  }, { html, options, semantic });
};
const content = (page: Page) => page.locator('.autolink-test .mw-content');
const replace = (page: Page, html: string) => page.evaluate((html) => {
  window.editor.setHTML(html);
  window.editor.setSelection(window.editor.surface.textContent!.length);
  window.changes = [];
}, html);

test('native Space completion links http, https and www without including the delimiter', async ({ page }) => {
  await initialize(page);
  for (const [label, href] of [['https://example.com/path', 'https://example.com/path'], ['http://localhost:3000/path', 'http://localhost:3000/path'], ['www.example.com/path', 'https://www.example.com/path']]) {
    await replace(page, '<p><br></p>');
    await page.keyboard.type(label);
    const changes = await page.evaluate(() => window.changes.length);
    await page.keyboard.press('Space');
    await expect(content(page).locator('a')).toHaveText(label);
    await expect(content(page).locator('a')).toHaveAttribute('href', href);
    expect(await page.evaluate(() => window.changes.length)).toBe(changes + 2);
    expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: label.length + 1, length: 0 });
    await page.keyboard.type('tail');
    await expect(content(page).locator('a')).toHaveText(label);
    await expect(content(page).locator('p')).toHaveText(`${label} tail`);
  }
});

test('sentence punctuation stays outside balanced URL paths and rich formatting survives', async ({ page }) => {
  await initialize(page, '<p>Go (<strong>https://example.</strong><em>com/path(a)</em>).</p>');
  await page.keyboard.press('Space');
  const anchor = content(page).locator('a');
  await expect(anchor).toHaveText('https://example.com/path(a)');
  await expect(anchor).toHaveAttribute('href', 'https://example.com/path(a)');
  await expect(anchor.locator('strong')).toHaveText('https://example.');
  await expect(anchor.locator('em')).toHaveText('com/path(a)');
  await expect(content(page).locator('p')).toHaveText('Go (https://example.com/path(a)). ');
  for (const suffix of [',', '!', '?', ';', ':', ']']) {
    await replace(page, `<p>https://example.com/path${suffix}</p>`);
    await page.keyboard.press('Space');
    await expect(anchor).toHaveText('https://example.com/path');
    await expect(content(page).locator('p')).toHaveText(`https://example.com/path${suffix} `);
  }
});

test('undo restores the literal completed URL including space and redo retains the next typing position', async ({ page }) => {
  const label = 'https://example.com';
  await initialize(page, `<p>${label}</p>`);
  await page.keyboard.press('Space');
  await expect(content(page).locator('a')).toHaveText(label);
  const linked = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('a')).toHaveCount(0);
  expect(await page.evaluate(() => window.editor.surface.textContent)).toMatch(/^https:\/\/example\.com[ \u00a0]$/);
  expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: label.length + 1, length: 0 });
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(linked);
  await page.keyboard.type('outside');
  await expect(content(page).locator('a')).toHaveText(label);
  await expect(content(page).locator('p')).toHaveText(`${label} outside`);
});

test('existing links, code, inline semantic nodes and unsupported protocols stay literal', async ({ page }) => {
  await initialize(page, '<p><br></p>', {}, true);
  for (const [html, anchors] of [
    ['<p><a href="https://example.com">https://example.com</a></p>', 1],
    ['<pre>https://example.com</pre>', 0],
    ['<p><code>https://example.com</code></p>', 0],
    ['<p><span data-mw-node="test:reference" data-id="42">https://example.com</span></p>', 0],
    ['<p>javascript:alert(1)</p>', 0],
    ['<p>ftp://example.com</p>', 0],
    ['<p>https://</p>', 0],
    ['<p>https://user:secret@example.com</p>', 0],
  ] as const) {
    await replace(page, html);
    await page.keyboard.press('Space');
    await expect(content(page).locator('a')).toHaveCount(anchors);
  }
});

test('native completion in a semantic callout preserves its registered metadata and history', async ({ page }) => {
  await initialize(page, '<blockquote data-mw-node="test:note" data-tone="note"><p>https://example.com</p></blockquote>', {}, true);
  await page.keyboard.press('Space');
  await expect(content(page).locator('blockquote')).toHaveAttribute('data-mw-node', 'test:note');
  await expect(content(page).locator('blockquote')).toHaveAttribute('data-tone', 'note');
  await expect(content(page).locator('a')).toHaveText('https://example.com');
  const node = await page.evaluate(() => window.editor.getJSON().children[0]);
  expect(node).toMatchObject({ attributes: { 'data-mw-node': 'test:note', 'data-tone': 'note' } });
  await page.evaluate(() => window.editor.undo());
  await expect(content(page).locator('a')).toHaveCount(0);
  await expect(content(page).locator('blockquote')).toHaveAttribute('data-tone', 'note');
  await page.evaluate(() => window.editor.redo());
  await expect(content(page).locator('blockquote a')).toHaveText('https://example.com');
});

test('whitespace paste, API replacement and multicharacter input do not trigger autolink', async ({ page }) => {
  await initialize(page, '<p>https://example.com </p>');
  await expect(content(page).locator('a')).toHaveCount(0);
  await page.evaluate(() => {
    window.editor.insertHTML('https://example.org ');
    window.editor.surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '  ' }));
  });
  await expect(content(page).locator('a')).toHaveCount(0);
  await replace(page, '<p><br></p>');
  await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'https://example.com ');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    window.editor.surface.dispatchEvent(event);
  });
  await expect(content(page).locator('a')).toHaveCount(0);
});

test('read-only, composition and noncollapsed input cannot create links', async ({ page }) => {
  await initialize(page, '<p>https://example.com </p>');
  await page.evaluate(() => {
    window.editor.setSelection(0, 3);
    window.editor.surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
  });
  await expect(content(page).locator('a')).toHaveCount(0);
  await page.evaluate(() => {
    window.editor.setSelection(window.editor.surface.textContent!.length);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ', isComposing: true }));
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: ' ' }));
  });
  await expect(content(page).locator('a')).toHaveCount(0);
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.editor.surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
  });
  await expect(content(page).locator('a')).toHaveCount(0);
});

test('bounded suffix inspection links valid tails in long paragraphs and rejects oversized URL tokens', async ({ page }) => {
  await initialize(page, `<p>${'prefix '.repeat(1000)}https://example.com</p>`);
  await page.keyboard.press('Space');
  await expect(content(page).locator('a')).toHaveText('https://example.com');
  await replace(page, `<p>https://example.com/${'x'.repeat(2048)}</p>`);
  await page.keyboard.press('Space');
  await expect(content(page).locator('a')).toHaveCount(0);
});

test('options are copied, state is instance-owned and disposed commands reject stale access', async ({ page }) => {
  await initialize(page);
  const states = await page.evaluate(async () => {
    const modulePath = '/packages/plugins/dist/autolink.js';
    const { autolink, autolinkCommands } = await import(/* @vite-ignore */ modulePath) as typeof import('@morfira-dev/wysiwyg/plugins/autolink');
    const settings = { enabled: true };
    const plugin = autolink(settings);
    settings.enabled = false;
    const firstHost = document.createElement('div');
    const secondHost = document.createElement('div');
    document.body.append(firstHost, secondHost);
    const first = window.createEditor(firstHost, { plugins: [plugin] });
    const second = window.createEditor(secondHost, { plugins: [plugin] });
    const firstAPI = autolinkCommands(first);
    const secondAPI = autolinkCommands(second);
    firstAPI.setEnabled(false);
    const snapshot = secondAPI.getState();
    snapshot.enabled = false;
    const states = [firstAPI.getState().enabled, secondAPI.getState().enabled];
    first.destroy();
    let rejected = false;
    try { firstAPI.getState(); }
    catch { rejected = true; }
    second.destroy();
    return { states, rejected };
  });
  expect(states).toEqual({ states: [false, true], rejected: true });
  await page.evaluate(() => { window.autolinkAPI.setEnabled(false); window.editor.setSelection(0); });
  await page.keyboard.type('https://example.com ');
  await expect(content(page).locator('a')).toHaveCount(0);
  await expect(content(page).locator('p')).toHaveText('https://example.com ');
  await page.evaluate(() => { window.editor.setReadOnly(true); window.autolinkAPI.setEnabled(true); });
  expect(await page.evaluate(() => window.autolinkAPI.getState())).toEqual({ enabled: true });
});

test('factory and public entry are server-safe and reject invalid options without DOM globals', () => {
  const script = `import {autolink} from './packages/plugins/dist/autolink.js'; if (autolink().name !== 'autolink') throw Error('factory'); for (const options of [null, [], {enabled:'yes'}, {other:true}]) { let failed=false; try {autolink(options)} catch {failed=true} if (!failed) throw Error('options'); }`;
  expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd() })).not.toThrow();
});
