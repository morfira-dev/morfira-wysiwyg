import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AutolinkOptions } from '@morfira-dev/wysiwyg/plugins/autolink';

const address = 'Alice.Example+notes@Example.COM';
const initialize = async (page: Page, html = '<p><br></p>', options: AutolinkOptions = { email: true }, preset = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async ({ html, options, preset }) => {
    const path = '/packages/plugins/dist/autolink.js';
    const { autolink, autolinkCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/autolink');
    window.dispose();
    const host = document.createElement('div');
    host.className = 'email-autolink';
    document.body.append(host);
    const schema = [{ name: 'test:reference', kind: 'inline' as const, tag: 'span' as const, attributes: { 'data-id': { type: 'text' as const, required: true } } }];
    if (preset) {
      const standardPath = '/packages/plugins/dist/presets/standard.js';
      const { createStandardPreset } = await import(/* @vite-ignore */ standardPath) as typeof import('@morfira-dev/wysiwyg/presets/standard');
      window.editor = window.createEditor(host, createStandardPreset({ value: html, schema, autolink: options }));
    }
    else window.editor = window.createEditor(host, { value: html, plugins: [autolink(options)], schema });
    window.autolinkAPI = autolinkCommands(window.editor);
    window.changes = [];
    window.editor.subscribe((change) => window.changes.push(change));
    window.editor.setSelection(window.editor.surface.textContent!.length);
  }, { html, options, preset });
};
const surface = (page: Page) => page.locator('.email-autolink .mw-content');
const replace = (page: Page, html: string) => page.evaluate((html) => {
  window.editor.setHTML(html);
  window.editor.setSelection(window.editor.surface.textContent!.length);
  window.changes = [];
}, html);
const paste = (page: Page, text: string, html = '') => page.evaluate(({ text, html }) => {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  if (html) data.setData('text/html', html);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  window.editor.surface.dispatchEvent(event);
}, { text, html });

test('explicit email Space completion preserves rich labels, punctuation, case and undo caret outside the link', async ({ page }) => {
  await initialize(page, '<p>Contact (<strong>Alice.Example</strong><em>+notes@Example.COM</em>).</p>');
  await page.keyboard.press('Space');
  const anchor = surface(page).locator('a');
  await expect(anchor).toHaveText(address);
  await expect(anchor).toHaveAttribute('href', `mailto:${address}`);
  await expect(anchor.locator('strong')).toHaveText('Alice.Example');
  await expect(anchor.locator('em')).toHaveText('+notes@Example.COM');
  await expect(surface(page)).toHaveText(`Contact (${address}). `);
  expect(await page.evaluate(() => window.changes.length)).toBe(2);
  const linked = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.undo());
  await expect(anchor).toHaveCount(0);
  await expect(surface(page)).toHaveText(`Contact (${address}). `);
  await page.evaluate(() => window.editor.redo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(linked);
  await page.keyboard.type('Outside');
  await expect(anchor).toHaveText(address);
  await expect(surface(page)).toHaveText(`Contact (${address}). Outside`);
});

test('controlled Enter links email in the source list item and preserves its new sibling caret and two-step history', async ({ page }) => {
  const before = `<ul><li>${address}</li></ul>`;
  await initialize(page, before);
  await page.keyboard.press('Enter');
  await expect(surface(page).locator('li')).toHaveCount(2);
  await expect(surface(page).locator('li').first().locator('a')).toHaveAttribute('href', `mailto:${address}`);
  expect(await page.evaluate(() => window.changes.length)).toBe(2);
  await page.evaluate(() => window.editor.undo());
  await expect(surface(page).locator('a')).toHaveCount(0);
  await expect(surface(page).locator('li')).toHaveCount(2);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => { window.editor.redo(); window.editor.redo(); });
  await page.keyboard.type('Next');
  await expect(surface(page).locator('li').last()).toHaveText('Next');
  await expect(surface(page).locator('a')).toHaveText(address);
});

test('single email paste wraps only the inserted token and keeps URL completion compatible when email is enabled', async ({ page }) => {
  await initialize(page, '<p>AB</p>');
  for (const [label, href] of [[address, `mailto:${address}`], ['www.example.com/path', 'https://www.example.com/path']]) {
    await replace(page, '<p>AB</p>');
    await page.evaluate(() => window.editor.setSelection(1));
    await paste(page, `${label}.`);
    await expect(surface(page)).toHaveText(`A${label}.B`);
    await expect(surface(page).locator('a')).toHaveText(label);
    await expect(surface(page).locator('a')).toHaveAttribute('href', href);
    expect(await page.evaluate(() => window.editor.getSelection())).toEqual({ index: label.length + 2, length: 0 });
    expect(await page.evaluate(() => window.changes.length)).toBe(2);
    await page.evaluate(() => window.editor.undo());
    await expect(surface(page).locator('a')).toHaveCount(0);
    await expect(surface(page)).toHaveText(`A${label}.B`);
    await page.evaluate(() => window.editor.undo());
    await expect(surface(page)).toHaveText('AB');
    await page.evaluate(() => { window.editor.redo(); window.editor.redo(); });
    await page.keyboard.type('X');
    await expect(surface(page)).toHaveText(`A${label}.XB`);
    await expect(surface(page).locator('a')).toHaveText(label);
  }
});

test('Space completion in a cell after an empty block does not create a second empty anchor at the same text offset', async ({ page }) => {
  await initialize(page, '<p title="Empty prefix"></p><table><tbody><tr><td colspan="2">Merged</td></tr><tr><td>A</td><td>B</td></tr></tbody></table>');
  // Numeric text offset zero resolves to the first actual text node in TD;
  // the preceding empty P must not participate in the inline formatting range.
  await page.evaluate(() => window.editor.setSelection(0));
  await page.keyboard.type(address);
  const paragraphs = await surface(page).locator(':scope > p').count();
  await page.keyboard.press('Space');
  await expect(surface(page).locator('a')).toHaveCount(1);
  await expect(surface(page).locator('td').first().locator('a')).toHaveAttribute('href', `mailto:${address}`);
  await expect(surface(page).locator(':scope > p')).toHaveCount(paragraphs);
  await expect(surface(page).locator(':scope > p[title="Empty prefix"]')).toHaveText('');
  await expect(surface(page).locator('td').first()).toHaveAttribute('colspan', '2');
  await expect(surface(page).locator('td').first()).toHaveText(`${address} Merged`);
  await expect(surface(page).locator('td').nth(1)).toHaveText('A');
  await expect(surface(page).locator('td').nth(2)).toHaveText('B');
  await page.evaluate(() => window.editor.undo());
  await expect(surface(page).locator('a')).toHaveCount(0);
  await expect(surface(page).locator('td').first()).toHaveText(`${address} Merged`);
  await page.evaluate(() => window.editor.redo());
  await page.keyboard.type('X');
  await expect(surface(page).locator('a')).toHaveCount(1);
  await expect(surface(page).locator('a')).toHaveText(address);
  await expect(surface(page).locator('td').first()).toHaveText(`${address} XMerged`);
});

test('bounded whole-token grammar refuses malformed, encoded, header, quoted and international address fragments', async ({ page }) => {
  await initialize(page);
  const invalid = [
    '.alice@example.com', 'alice.@example.com', 'alice..x@example.com', 'alice@@example.com',
    'alice!x@example.com', 'alice%40x@example.com', 'mailto:alice@example.com', 'https://alice@example.com',
    'alice@example.com?subject=Hello', 'alice@example.com%0d%0aBcc:other@example.com',
    'alice@example.com\u0001tail', 'prefix(alice@example.com', 'bad[alice@example.com',
    '"alice"@example.com', '<alice@example.com>', 'alice@localhost', 'alice@[127.0.0.1]',
    'alice@-example.com', 'alice@example-.com', 'alice@example..com', 'alice@example.c',
    'алиса@example.com', 'alice@пример.рф', 'alice@xn--e1afmkfd.com',
    `${'a'.repeat(65)}@example.com`, `a@${'b'.repeat(64)}.com`,
    `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.com`,
    `${'x'.repeat(2100)}alice@example.com`,
  ];
  for (const label of invalid) {
    await page.evaluate((label) => {
      window.editor.setHTML('<p><br></p>');
      const paragraph = window.editor.surface.firstElementChild!;
      paragraph.replaceChildren(document.createTextNode(label));
      window.editor.surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: label }));
      window.editor.setSelection(label.length);
    }, label);
    await page.keyboard.press('Space');
    await expect(surface(page).locator('a'), label).toHaveCount(0);
  }
  for (const label of ['a_b-c+tag@sub.Example.com', 'www.alice@example.com', `${'a'.repeat(64)}@example.com`, `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`]) {
    await replace(page, `<p>${label}</p>`);
    await page.keyboard.press('Space');
    await expect(surface(page).locator('a')).toHaveAttribute('href', `mailto:${label}`);
  }
});

test('email completion preserves code, semantic, HTML, selected and external-value barriers', async ({ page }) => {
  await initialize(page);
  for (const html of [`<pre>${address}</pre>`, `<p><code>${address}</code></p>`, `<p><span data-mw-node="test:reference" data-id="42">${address}</span></p>`, `<figure><figcaption>${address}</figcaption></figure>`]) {
    await replace(page, html);
    await page.keyboard.press('Space');
    await expect(surface(page).locator('a')).toHaveCount(0);
  }
  for (const [text, html] of [[address, `<p>${address}</p>`], [`${address}\nNext`, ''], [` ${address}`, '']]) {
    await replace(page, '<p><br></p>');
    await paste(page, text, html);
    await expect(surface(page).locator('a')).toHaveCount(0);
  }
  await replace(page, '<p>Replace</p>');
  await page.evaluate(() => window.editor.setSelection(0, 7));
  await paste(page, address);
  await expect(surface(page).locator('a')).toHaveCount(0);
  await replace(page, `<p>${address}</p>`);
  await page.evaluate(() => { window.editor.setJSON(window.editor.getJSON()); window.editor.insertHTML(' '); });
  await expect(surface(page).locator('a')).toHaveCount(0);
});

test('email opt-in retains composition recovery, readonly refusal and stale committed-input cancellation', async ({ page }) => {
  await initialize(page, `<p>${address}</p>`);
  await page.evaluate(() => {
    window.editor.setReadOnly(true);
    window.editor.surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
    window.editor.setReadOnly(false);
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.surface.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph', isComposing: true }));
  });
  await expect(surface(page).locator('a')).toHaveCount(0);
  await replace(page, `<p>Recovered ${address}</p>`);
  await page.keyboard.press('Enter');
  await expect(surface(page).locator('a')).toHaveText(address);
  await replace(page, `<p>${address}</p>`);
  await page.evaluate(() => {
    const stop = window.editor.subscribe((change) => {
      if (change.source !== 'user') return;
      stop();
      window.editor.setHTML('<p>Application replacement</p>');
    });
  });
  await page.keyboard.press('Enter');
  await expect(surface(page)).toHaveText('Application replacement');
  await expect(surface(page).locator('a')).toHaveCount(0);
});

test('email defaults off, presets forward explicit opt-in and copied settings stay isolated through cleanup', async ({ page }) => {
  await initialize(page, `<p>${address}</p>`, {});
  await page.keyboard.press('Space');
  await expect(surface(page).locator('a')).toHaveCount(0);
  await initialize(page, `<p>${address}</p>`, { email: true }, true);
  await page.keyboard.press('Space');
  await expect(surface(page).locator('a')).toHaveText(address);
  const result = await page.evaluate(async (address) => {
    const path = '/packages/plugins/dist/autolink.js';
    const { autolink, autolinkCommands } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/autolink');
    const settings = { email: true };
    const plugin = autolink(settings);
    settings.email = false;
    const firstHost = document.createElement('div');
    const secondHost = document.createElement('div');
    document.body.append(firstHost, secondHost);
    const first = window.createEditor(firstHost, { value: `<p>${address} </p>`, plugins: [plugin] });
    const second = window.createEditor(secondHost, { value: `<p>${address} </p>`, plugins: [plugin] });
    const firstAPI = autolinkCommands(first);
    firstAPI.setEnabled(false);
    first.setSelection(address.length + 1);
    first.surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
    second.setSelection(address.length + 1);
    second.surface.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
    const isolated = [first.surface.querySelectorAll('a').length, second.surface.querySelectorAll('a').length];
    const root = second.surface;
    second.destroy();
    const after = root.innerHTML;
    root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
    first.destroy();
    let disposed = false;
    try { firstAPI.getState(); } catch { disposed = true; }
    const rejected = [null, [], { email: 'yes' }, { email: 1 }, { unknown: true }].every((value) => {
      try { autolink(value as AutolinkOptions); return false; } catch { return true; }
    });
    return { isolated, disposed, rejected, unchanged: root.innerHTML === after };
  }, address);
  expect(result).toEqual({ isolated: [0, 1], disposed: true, rejected: true, unchanged: true });
});
