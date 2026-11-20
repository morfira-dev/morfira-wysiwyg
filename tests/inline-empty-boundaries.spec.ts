import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const initialize = async (page: Page, value: string, semantic = false) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(({ value, semantic }) => {
    window.dispose();
    const host = document.createElement('div');
    host.className = 'empty-inline-boundaries';
    document.body.append(host);
    window.changes = [];
    window.editor = window.createEditor(host, {
      value,
      schema: semantic ? [
        { name: 'test:empty-block', kind: 'block', tag: 'p', attributes: { 'data-id': { type: 'text', required: true } } },
        { name: 'test:empty-inline', kind: 'inline', tag: 'span', attributes: { 'data-id': { type: 'text', required: true } } },
      ] : [],
      onChange: (change) => window.changes.push(change),
    });
    window.dispose = () => { window.editor.destroy(); host.remove(); };
    window.editor.setSelection(0, 5);
  }, { value, semantic });
};

test('link and color leave empty blocks, rules, columns and cells outside generated inline wrappers through history', async ({ page }) => {
  const value = '<p title="empty"></p><h2 title="heading"></h2><hr title="rule"><table><colgroup><col title="column"></colgroup><tbody><tr><td title="empty-cell"></td><td title="body">Alpha</td></tr></tbody></table><p title="tail"></p>';
  await initialize(page, value);
  const before = await page.evaluate(() => window.editor.getHTML());
  for (const format of ['link', 'color']) {
    await page.evaluate((format) => {
      window.editor.setSelection(0, 5);
      window.editor.format(format, format === 'link' ? '/selected' : 'red');
    }, format);
    expect(await page.evaluate((format) => {
      const root = window.editor.surface;
      const body = root.querySelector('[title=body]')!;
      const wrapper = body.querySelector(format === 'link' ? 'a' : 'span')!;
      const titles = ['empty', 'heading', 'rule', 'column', 'empty-cell', 'tail'];
      const owners = titles.map((title) => root.querySelector(`[title="${title}"]`)!);
      return {
        wrapperText: wrapper.textContent,
        wrapperTag: wrapper.localName,
        href: wrapper.getAttribute('href'),
        color: (wrapper as HTMLElement).style.color,
        emptyOwners: owners.every((node) => node.childNodes.length === 0),
        ownerTags: owners.map((node) => node.localName),
        protectedFromWrapping: owners.every((node) => !node.closest('a,span')),
        rootTags: [...root.children].map((node) => node.localName),
        selection: window.editor.getSelection(),
      };
    }, format)).toEqual({ wrapperText: 'Alpha', wrapperTag: format === 'link' ? 'a' : 'span',
      href: format === 'link' ? '/selected' : null, color: format === 'color' ? 'red' : '', emptyOwners: true,
      ownerTags: ['p', 'h2', 'hr', 'col', 'td', 'p'], protectedFromWrapping: true,
      rootTags: ['p', 'h2', 'hr', 'table', 'p'], selection: { index: 0, length: 5 } });
    const after = await page.evaluate(() => window.editor.getHTML());
    await page.evaluate(() => window.editor.undo());
    expect(await page.evaluate(() => ({ html: window.editor.getHTML(), selection: window.editor.getSelection(), undo: window.editor.canUndo() })))
      .toEqual({ html: before, selection: { index: 0, length: 5 }, undo: false });
    await page.evaluate(() => window.editor.redo());
    expect(await page.evaluate(() => window.editor.getHTML())).toBe(after);
    await page.evaluate(() => window.editor.undo());
  }
});

test('empty semantic block and inline owners retain metadata without acquiring link or style wrappers', async ({ page }) => {
  await initialize(page, '<p data-mw-node="test:empty-block" data-id="block"></p><p><span data-mw-node="test:empty-inline" data-id="inline"></span>Alpha</p>', true);
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => {
    window.editor.format('link', '/selected');
    window.editor.format('color', 'red');
  });
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const owners = [...root.querySelectorAll('[data-mw-node]')];
    const anchor = root.querySelector('a')!;
    return {
      owners: owners.map((node) => [node.localName, node.getAttribute('data-id'), node.childNodes.length]),
      outside: owners.every((node) => !node.parentElement?.closest('a,span') && !node.querySelector('a,span')),
      body: root.lastElementChild!.localName,
      anchor: [anchor.textContent, anchor.getAttribute('href')],
      colored: root.querySelector<HTMLElement>('span[style]')!.style.color,
      selection: window.editor.getSelection(), changes: window.changes.length,
    };
  })).toEqual({ owners: [['p', 'block', 0], ['span', 'inline', 0]], outside: true, body: 'p',
    anchor: ['Alpha', '/selected'], colored: 'red', selection: { index: 0, length: 5 }, changes: 2 });
  const after = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => { window.editor.undo(); window.editor.undo(); });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => { window.editor.redo(); window.editor.redo(); });
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(after);
});

test('ordinary inline images and breaks retain their existing selected-boundary affinity', async ({ page }) => {
  await initialize(page, '<p><img src="/logo.svg" alt="Inline"><br>Alpha</p>');
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(() => window.editor.format('link', '/selected'));
  expect(await page.evaluate(() => {
    const root = window.editor.surface;
    const anchor = root.querySelector('a')!;
    return { children: [...anchor.children].map((node) => node.localName), text: anchor.textContent,
      href: anchor.getAttribute('href'), image: anchor.querySelector('img')!.getAttribute('alt'),
      selection: window.editor.getSelection() };
  })).toEqual({ children: ['img', 'br'], text: 'Alpha', href: '/selected', image: 'Inline', selection: { index: 0, length: 5 } });
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
});
