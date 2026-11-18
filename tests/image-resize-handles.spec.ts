import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import './image-resize-handles.types.js';

const original = '<figure><img src="/logo.svg" width="120" height="80" alt="Resizable"><figcaption><strong>Rich</strong> caption</figcaption></figure><p>Tail</p>';
const surface = (page: Page) => page.locator('.handles-editor .mw-content');
const image = (page: Page) => surface(page).locator('img').first();
const controls = (page: Page) => page.locator('.handles-host .mw-image-resize');
const corner = (page: Page, name = 'se') => controls(page).locator(`[data-mw-resize-corner="${name}"]`);

const initialize = async (page: Page, html = original) => {
  await page.goto('/');
  await expect(page.locator('.mw-content')).toBeVisible();
  await page.addStyleTag({ url: '/packages/plugins/dist/ui/image-resize.css' });
  await page.addStyleTag({ content: '.handles-editor{margin:60px;width:700px}.handles-editor .mw-content{padding:20px;min-height:300px}.handles-editor img{display:block;max-width:none!important;max-height:none!important}' });
  await page.evaluate(async (value) => {
    window.dispose();
    const mount = document.createElement('div');
    mount.className = 'handles-editor';
    const host = document.createElement('div');
    host.className = 'handles-host';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none';
    document.body.replaceChildren(mount, host);
    window.changes = [];
    window.handlesResizeErrors = [];
    window.editor = window.createEditor(mount, { value, locale: 'en', plugins: [window.createImages()], onChange: (change) => window.changes.push(change) });
    window.handlesResizeAPI = window.imageCommands(window.editor);
    const path = '/packages/plugins/dist/ui/image-resize.js';
    const { createImageResizeUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/image-resize');
    window.handlesResizeUI = createImageResizeUI(host, window.editor, { onError: (error) => window.handlesResizeErrors.push(String(error)) });
    const img = window.editor.surface.querySelector('img');
    if (img) window.handlesResizeAPI.select(img);
    window.handlesResizeUI.refresh();
    window.dispose = () => { window.handlesResizeUI.destroy(); window.editor.destroy(); mount.remove(); host.remove(); };
  }, html);
};

const begin = async (page: Page, handle: Locator = corner(page)) => {
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Expected a visible resize handle.');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.evaluate(() => {
    document.addEventListener('pointerdown', (event) => { window.handlesPointerId = event.pointerId; }, { capture: true, once: true });
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  return point;
};

const settleFrames = async (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const resetSelection = async (page: Page, html = original) => page.evaluate((value) => {
  window.editor.setHTML(value);
  window.handlesResizeAPI.select(window.editor.surface.querySelector('img')!);
  window.handlesResizeUI.refresh();
  window.changes = [];
}, html);

test('pointer preview changes no document data and a proportional drop preserves nodes in one Undo/Redo', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  const identities = await surface(page).evaluateHandle((root) => ({ image: root.querySelector('img'), figure: root.querySelector('figure'), rich: root.querySelector('figcaption strong') }));
  const point = await begin(page);
  await page.mouse.move(point.x + 60, point.y + 40, { steps: 5 });
  await expect(controls(page).getByRole('status')).toContainText('180');
  await expect(controls(page).getByRole('status')).toContainText('120');
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length, undo: window.editor.canUndo() })))
    .toEqual({ html: before, changes: 0, undo: false });
  await expect(image(page)).toHaveAttribute('width', '120');
  await expect(image(page)).toHaveAttribute('height', '80');
  await page.mouse.up();
  await expect(image(page)).toHaveAttribute('width', '180');
  await expect(image(page)).toHaveAttribute('height', '120');
  expect(await identities.evaluate((nodes) => nodes.image === window.editor.surface.querySelector('img')
    && nodes.figure === window.editor.surface.querySelector('figure') && nodes.rich === window.editor.surface.querySelector('figcaption strong'))).toBe(true);
  expect(await page.evaluate(() => window.changes.length)).toBe(1);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
  await page.evaluate(() => window.editor.redo());
  await expect(image(page)).toHaveAttribute('width', '180');
  await expect(image(page)).toHaveCSS('height', '120px');
});

test('the remaining corner directions project outward motion onto the same fixed aspect ratio', async ({ page }) => {
  await initialize(page);
  for (const [name, x, y] of [['nw', -30, -20], ['ne', 30, -20], ['sw', -30, 20]] as const) {
    await resetSelection(page);
    const point = await begin(page, corner(page, name));
    await page.mouse.move(point.x + x, point.y + y, { steps: 3 });
    await page.mouse.up();
    await expect(image(page)).toHaveAttribute('width', '150');
    await expect(image(page)).toHaveAttribute('height', '100');
    await expect(surface(page).locator('figcaption strong')).toHaveText('Rich');
  }
});

test('no-motion drops are inert and extreme drags clamp both integer dimensions to the command bounds', async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1400 });
  await initialize(page);
  await page.locator('.handles-editor').evaluate((element) => { element.style.width = '1700px'; });
  await page.evaluate(() => window.handlesResizeUI.refresh());
  await begin(page);
  await page.mouse.up();
  expect(await page.evaluate(() => ({ undo: window.editor.canUndo(), changes: window.changes.length }))).toEqual({ undo: false, changes: 0 });
  const maximum = await begin(page);
  await page.mouse.move(maximum.x + 1500, maximum.y + 1000, { steps: 4 });
  await page.mouse.up();
  await expect(image(page)).toHaveAttribute('width', '1000');
  await expect(image(page)).toHaveAttribute('height', '667');
  await begin(page);
  await page.mouse.move(1, 1, { steps: 4 });
  await page.mouse.up();
  await expect(image(page)).toHaveAttribute('width', '1');
  await expect(image(page)).toHaveAttribute('height', '1');
});

test('Escape, pointer cancellation, window blur and scrolling discard gesture previews without history', async ({ page }) => {
  await initialize(page);
  for (const reason of ['escape', 'pointercancel', 'blur', 'scroll'] as const) {
    await resetSelection(page);
    const before = await page.evaluate(() => window.editor.getHTML());
    const point = await begin(page);
    await page.mouse.move(point.x + 30, point.y + 20);
    if (reason === 'escape') await page.keyboard.press('Escape');
    else await page.evaluate((kind) => {
      if (kind === 'pointercancel') window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.handlesPointerId, isPrimary: true, bubbles: true }));
      else if (kind === 'blur') window.dispatchEvent(new Event('blur'));
      else document.dispatchEvent(new Event('scroll', { bubbles: true }));
    }, reason);
    await page.mouse.up();
    await settleFrames(page);
    expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length })))
      .toEqual({ html: before, undo: false, changes: 0 });
    if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    if (reason === 'escape') {
      await page.evaluate(() => window.handlesResizeUI.refresh());
      await expect(controls(page)).toBeHidden();
      await image(page).click();
      await expect(corner(page)).toBeVisible();
    }
  }
});

test('a foreign pointer cannot finish the captured gesture and lost capture cancels its own pointer', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  const point = await begin(page);
  await page.mouse.move(point.x + 30, point.y + 20);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', {
    pointerId: window.handlesPointerId + 100, isPrimary: true, bubbles: true, clientX: 900, clientY: 600,
  })));
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
  await page.mouse.up();
  await expect(image(page)).toHaveAttribute('width', '150');
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
  await page.evaluate(() => window.handlesResizeAPI.select(window.editor.surface.querySelector('img')!));
  const cancelled = await begin(page);
  await page.mouse.move(cancelled.x + 60, cancelled.y + 40);
  await corner(page).evaluate((handle) => {
    if (handle.hasPointerCapture(window.handlesPointerId)) handle.releasePointerCapture(window.handlesPointerId);
  });
  await page.mouse.up();
  await settleFrames(page);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
});

test('replacement, read-only, composition and destruction invalidate active drags rather than changing a new document', async ({ page }) => {
  await initialize(page);
  for (const reason of ['replacement', 'readonly', 'composition', 'focusreplacement', 'destroy'] as const) {
    await page.evaluate(() => {
      window.editor.setReadOnly(false);
      window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    await resetSelection(page);
    if (reason === 'focusreplacement') await corner(page).focus();
    const point = await begin(page);
    await page.mouse.move(point.x + 60, point.y + 40);
    const expected = await page.evaluate((kind) => {
      if (kind === 'replacement') window.editor.setHTML('<figure><img src="/logo.svg" width="200" height="100" alt="External"></figure><p>New</p>');
      else if (kind === 'readonly') window.editor.setReadOnly(true);
      else if (kind === 'composition') window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      else if (kind === 'focusreplacement') {
        window.handlesFocusExpected = '';
        window.editor.surface.addEventListener('focusin', () => {
          window.editor.setHTML('<p>Focus replacement<img src="/logo.svg" width="200" height="100"></p>');
          window.handlesFocusExpected = window.editor.getHTML();
        }, { once: true });
      }
      else window.handlesResizeUI.destroy();
      return window.editor.getHTML();
    }, reason);
    await page.mouse.up();
    await settleFrames(page);
    const after = reason === 'focusreplacement' ? await page.evaluate(() => window.handlesFocusExpected) : expected;
    expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.filter((change) => change.source === 'user').length })))
      .toEqual({ html: after, undo: false, changes: 0 });
    if (reason === 'composition') {
      // API replacement ends the old composition session even without compositionend.
      await resetSelection(page);
      await expect(corner(page)).toBeVisible();
    }
  }
  await expect(controls(page)).toHaveCount(0);
  await page.evaluate(() => {
    window.handlesResizeAPI.select(window.editor.surface.querySelector('img')!);
    window.handlesResizeAPI.resize({ width: 60 });
  });
  await expect(image(page)).toHaveAttribute('height', '40');
});

test('native selection departure from focused handles and focus callbacks cannot restore an obsolete image target', async ({ page }) => {
  const html = original + '<p>Other<img src="/logo.svg" width="80" height="40" alt="Other"></p>';
  await initialize(page, html);
  const before = await page.evaluate(() => window.editor.getHTML());
  for (const target of ['text', 'other-image'] as const) {
    await resetSelection(page, html);
    const handle = corner(page);
    const retained = await handle.evaluateHandle((element) => element);
    await handle.focus();
    expect(await retained.evaluate((element, kind) => {
      const root = window.editor.surface;
      const range = document.createRange();
      if (kind === 'text') {
        range.selectNodeContents(root.querySelector('p')!);
        range.collapse(false);
      }
      else range.selectNode(root.querySelectorAll('img')[1]);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.rangeCount === 1 && root.contains(selection.getRangeAt(0).startContainer);
    }, target)).toBe(true);
    if (target === 'text') await expect(controls(page)).toBeHidden();
    await retained.evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    await settleFrames(page);
    expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length })))
      .toEqual({ html: before, undo: false, changes: 0 });
  }
  await resetSelection(page, html);
  await corner(page).focus();
  const point = await begin(page);
  await page.mouse.move(point.x + 30, point.y + 20);
  const focus = await page.evaluateHandle(() => {
    const state = { called: false, target: window.editor.surface.querySelectorAll('img')[1] };
    window.editor.surface.addEventListener('focusin', () => {
      state.called = true;
      const range = document.createRange();
      range.selectNode(state.target);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }, { once: true });
    return state;
  });
  await page.mouse.up();
  await settleFrames(page);
  expect(await focus.evaluate((state) => {
    const range = document.getSelection()?.getRangeAt(0);
    return { called: state.called, selectedOther: Boolean(range && range.startContainer === state.target.parentNode
      && range.endOffset === range.startOffset + 1 && range.startContainer.childNodes[range.startOffset] === state.target) };
  })).toEqual({ called: true, selectedOther: true });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length })))
    .toEqual({ html: before, undo: false, changes: 0 });
});

test('keyboard sizing uses native focused handles, one-pixel and Shift steps without application form submission', async ({ page }) => {
  await initialize(page);
  const before = await page.evaluate(() => window.editor.getHTML());
  const handle = corner(page);
  await handle.focus();
  await page.evaluate(() => {
    document.getSelection()?.removeAllRanges();
    window.handlesResizeUI.refresh();
  });
  await expect(handle).toBeFocused();
  await handle.press('ArrowRight');
  await expect(image(page)).toHaveAttribute('width', '121');
  await expect(image(page)).toHaveAttribute('height', '81');
  await page.evaluate(() => window.editor.undo());
  await page.evaluate(() => window.handlesResizeAPI.select(window.editor.surface.querySelector('img')!));
  await expect(handle).toBeVisible();
  await handle.focus();
  await handle.press('Shift+ArrowDown');
  await expect(image(page)).toHaveAttribute('width', '135');
  await expect(image(page)).toHaveAttribute('height', '90');
  await page.evaluate(() => window.editor.undo());
  await page.evaluate(() => window.handlesResizeAPI.select(window.editor.surface.querySelector('img')!));
  const submissions = await page.evaluateHandle(() => {
    const form = document.createElement('form');
    let count = 0;
    form.addEventListener('submit', (event) => { event.preventDefault(); count++; });
    document.body.append(form);
    form.append(window.handlesResizeUI.element.parentElement!);
    return () => count;
  });
  await handle.focus();
  await handle.press('Enter');
  await handle.press('Space');
  await handle.press('Control+ArrowRight');
  expect(await submissions.evaluate((count) => count())).toBe(0);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo() }))).toEqual({ html: before, undo: false });
});

test('inline images in a merged cell keep their owner, rich neighbours and table geometry during resize', async ({ page }) => {
  await initialize(page, '<table><tbody><tr><td rowspan="2"><p><em>A<img src="/logo.svg" width="120" height="80">B</em></p></td><td>One</td></tr><tr><td>Two</td></tr></tbody></table><p>Tail</p>');
  const before = await page.evaluate(() => window.editor.getHTML());
  const nodes = await surface(page).evaluateHandle((root) => ({ table: root.querySelector('table'), cell: root.querySelector('td'), image: root.querySelector('img'), emphasis: root.querySelector('em') }));
  const point = await begin(page);
  await page.mouse.move(point.x + 30, point.y + 20);
  await page.mouse.up();
  await expect(image(page)).toHaveAttribute('width', '150');
  await expect(surface(page).locator('td[rowspan="2"]')).toHaveCount(1);
  await expect(surface(page).locator('td')).toHaveCount(3);
  expect(await nodes.evaluate((saved) => saved.table === window.editor.surface.querySelector('table') && saved.cell === window.editor.surface.querySelector('td')
    && saved.image === window.editor.surface.querySelector('img') && saved.emphasis === window.editor.surface.querySelector('em'))).toBe(true);
  await page.evaluate(() => window.editor.undo());
  expect(await page.evaluate(() => window.editor.getHTML())).toBe(before);
});

test('already loaded natural dimensions enable handles without an extra resource request and unknown ratios stay hidden', async ({ page }) => {
  let requests = 0;
  await page.route('**/handles-natural.svg', async (route) => {
    requests++;
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"></svg>' });
  });
  await initialize(page, '<p><img src="/handles-natural.svg" alt="Natural"></p><p>Tail</p>');
  await expect.poll(() => image(page).evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(120);
  await page.evaluate(() => window.handlesResizeUI.refresh());
  await expect(corner(page)).toBeVisible();
  const fetched = requests;
  const point = await begin(page);
  await page.mouse.move(point.x + 30, point.y + 20);
  await page.mouse.up();
  await expect(image(page)).toHaveAttribute('width', '150');
  await expect(image(page)).toHaveAttribute('height', '100');
  await settleFrames(page);
  expect(requests).toBe(fetched);
  await surface(page).evaluate((element) => { element.style.minHeight = '0'; element.style.height = '40px'; element.style.overflow = 'hidden'; });
  await page.evaluate(() => window.handlesResizeUI.refresh());
  await expect(corner(page, 'se')).toBeHidden();
  await expect(corner(page, 'ne')).toBeVisible();
  await surface(page).evaluate((element) => { element.style.minHeight = ''; element.style.height = ''; element.style.overflow = ''; });
  await page.evaluate(() => window.handlesResizeUI.refresh());
  await expect(corner(page)).toBeVisible();
  await page.route('**/handles-unavailable.png', (route) => route.abort());
  await resetSelection(page, '<p><img src="/handles-unavailable.png" alt="Unavailable"></p>');
  await expect(controls(page)).toBeHidden();
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
});

test('two editors own independent controls and detached callbacks and SSR imports remain inert', async ({ page }) => {
  await initialize(page);
  const oldHandle = await corner(page).evaluateHandle((element) => element);
  const before = await page.evaluate(() => window.editor.getHTML());
  await page.evaluate(async () => {
    const mount = document.createElement('div');
    mount.className = 'handles-editor handles-second-editor';
    const host = document.createElement('div');
    host.className = 'handles-second-host';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none';
    document.body.prepend(mount, host);
    window.handlesOtherChanges = 0;
    window.handlesOtherEditor = window.createEditor(mount, { locale: 'ru', value: '<p><img src="/logo.svg" width="80" height="40"></p>', plugins: [window.createImages()], onChange: () => { window.handlesOtherChanges++; } });
    window.handlesOtherAPI = window.imageCommands(window.handlesOtherEditor);
    const path = '/packages/plugins/dist/ui/image-resize.js';
    const { createImageResizeUI } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/image-resize');
    window.handlesOtherUI = createImageResizeUI(host, window.handlesOtherEditor);
    window.handlesOtherAPI.select(window.handlesOtherEditor.surface.querySelector('img')!);
    window.handlesOtherUI.refresh();
    window.handlesResizeUI.destroy();
    window.handlesResizeUI.destroy();
  });
  await oldHandle.evaluate((handle) => {
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 400, isPrimary: true, button: 0, bubbles: true, cancelable: true }));
  });
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), changes: window.changes.length }))).toEqual({ html: before, changes: 0 });
  const second = page.locator('.handles-second-host [data-mw-resize-corner="se"]');
  await expect(second).toBeVisible();
  await second.focus();
  await second.press('Shift+ArrowRight');
  await expect(page.locator('.handles-second-editor img')).toHaveAttribute('width', '90');
  await expect(page.locator('.handles-second-editor img')).toHaveAttribute('height', '45');
  expect(await page.evaluate(() => window.handlesOtherChanges)).toBe(1);
  await page.evaluate(() => window.handlesOtherEditor.destroy());
  await expect(page.locator('.handles-second-host .mw-image-resize')).toHaveCount(0);
  const imported = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { createImageResizeUI } from '@morfira-dev/wysiwyg/ui/image-resize';
    process.stdout.write(JSON.stringify({ factory: typeof createImageResizeUI, document: typeof document }));
  `], { cwd: process.cwd(), encoding: 'utf8' });
  expect(JSON.parse(imported)).toEqual({ factory: 'function', document: 'undefined' });
});
