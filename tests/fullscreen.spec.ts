import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { FullscreenTestOptions } from './fullscreen.types.js';
import './fullscreen.types.js';

const button = (page: Page) => page.locator('.fullscreen-controls').getByRole('button');
const content = (page: Page) => page.locator('.fullscreen-workspace .mw-content');
const html = (page: Page) => page.evaluate(() => window.editor.getHTML());

const initialize = async (page: Page, options: FullscreenTestOptions = {}) => {
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.evaluate(async (value) => {
    window.dispose();
    await Promise.all(['core/dist/style.css', 'plugins/dist/ui/fullscreen.css'].map((path) => new Promise<void>((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/packages/' + path;
      css.onload = () => resolve();
      css.onerror = () => reject(new Error(`Could not load ${path}`));
      document.head.append(css);
    })));
    const positioner = document.createElement('div');
    positioner.style.cssText = 'margin:80px 24px;max-width:500px';
    const workspace = document.createElement('section');
    workspace.className = 'fullscreen-workspace app-owned-workspace';
    const controls = document.createElement('div');
    controls.className = 'fullscreen-controls';
    const mount = document.createElement('div');
    const outside = document.createElement('input');
    outside.setAttribute('aria-label', 'Outside fullscreen workspace');
    workspace.append(controls, mount);
    positioner.append(workspace);
    document.body.prepend(positioner, outside);
    window.changes = [];
    window.fullscreenChanges = [];
    window.fullscreenErrors = [];
    window.editor = window.createEditor(mount, { value, locale: 'en', onChange: (change) => window.changes.push(change) });
    window.editor.focus();
    window.editor.setSelection(2);
    const path = '/packages/wysiwyg/dist/ui/fullscreen.js';
    window.fullscreenModule = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/ui/fullscreen');
    window.fullscreenWorkspace = workspace;
    window.fullscreenPositioner = positioner;
    window.fullscreenControlHost = controls;
    window.fullscreenUI = window.fullscreenModule.createFullscreenUI(controls, window.editor, {
      target: workspace,
      onChange: (active) => window.fullscreenChanges.push(active),
      onError: (error) => window.fullscreenErrors.push(error),
    });
    window.dispose = () => {
      window.fullscreenUI.destroy();
      window.editor.destroy();
      positioner.remove();
      outside.remove();
    };
  }, options.value ?? '<p>Alpha text</p>');
};

const selected = (page: Page) => page.evaluate(() => {
  const native = document.getSelection()!;
  return {
    logical: window.editor.getSelection(), text: native.toString(),
    anchor: native.anchorNode?.nodeName, anchorOffset: native.anchorOffset,
    focus: native.focusNode?.nodeName, focusOffset: native.focusOffset,
  };
});

test('viewport mode preserves actual nodes, backward selection and document history through pointer toggles', async ({ page }) => {
  const original = '<p>A <strong>word</strong> Z</p>';
  await initialize(page, { value: original });
  await page.evaluate(() => {
    const text = window.editor.surface.querySelector('strong')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(text, 4, text, 1);
  });
  const before = await selected(page);
  const editorNode = await content(page).elementHandle();
  const mark = await content(page).locator('strong').elementHandle();
  const parent = await page.locator('.fullscreen-workspace').evaluateHandle((node) => node.parentNode);
  await expect(button(page)).toHaveAccessibleName('Enter fullscreen');
  await button(page).click();
  await expect(button(page)).toHaveAttribute('aria-pressed', 'true');
  const box = await page.locator('.fullscreen-workspace').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(box.left).toBeCloseTo(0, 1);
  expect(box.top).toBeCloseTo(0, 1);
  expect(box.width).toBeCloseTo(box.viewportWidth, 1);
  expect(box.height).toBeCloseTo(box.viewportHeight, 1);
  expect(await selected(page)).toEqual(before);
  expect(await editorNode!.evaluate((node) => node === window.editor.surface)).toBe(true);
  expect(await mark!.evaluate((node) => node === window.editor.surface.querySelector('strong'))).toBe(true);
  expect(await parent.evaluate((node) => node === window.fullscreenWorkspace.parentNode)).toBe(true);
  await button(page).click();
  await expect(button(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await selected(page)).toEqual(before);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length, mode: window.fullscreenChanges, appClass: window.fullscreenWorkspace.classList.contains('app-owned-workspace') })))
    .toEqual({ html: original, undo: false, changes: 0, mode: [true, false], appClass: true });
});

test('typing and API synchronization while expanded retain current caret and normal Undo instead of the entry selection', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => window.fullscreenUI.enter())).toBe(true);
  await page.keyboard.insertText('!');
  await expect(content(page)).toHaveText('Al!pha text');
  await page.evaluate(() => window.editor.undo());
  expect(await html(page)).toBe('<p>Alpha text</p>');
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(false);
  await page.evaluate(() => {
    window.editor.setHTML('<p>Fresh text</p>');
    window.editor.setSelection(5);
  });
  expect(await page.evaluate(() => window.fullscreenUI.isActive())).toBe(true);
  await page.keyboard.insertText('!');
  const beforeExit = await selected(page);
  await page.evaluate(() => window.fullscreenUI.exit());
  expect(await selected(page)).toEqual(beforeExit);
  expect(await page.evaluate(() => window.editor.canUndo())).toBe(true);
  await page.keyboard.insertText('?');
  await expect(content(page)).toHaveText('Fresh!? text');
});

test('locale refresh keeps the native button and focus while nested Escape wins before workspace exit and readonly stays viewable', async ({ page }) => {
  await initialize(page);
  const control = await button(page).elementHandle();
  await button(page).focus();
  await page.evaluate(() => window.editor.setLocale('ru'));
  await expect(button(page)).toHaveAccessibleName('Во весь экран');
  await expect(button(page)).toBeFocused();
  expect(await control!.evaluate((node) => node === window.fullscreenUI.element)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(button(page)).toHaveAccessibleName('Выйти из полноэкранного режима');
  await page.evaluate(() => {
    const nested = document.createElement('input');
    nested.setAttribute('aria-label', 'Nested menu');
    nested.addEventListener('keydown', (event) => { if (event.key === 'Escape') event.preventDefault(); });
    window.fullscreenWorkspace.append(nested);
  });
  await page.getByLabel('Nested menu', { exact: true }).focus();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.fullscreenUI.isActive())).toBe(true);
  await page.evaluate(() => { window.editor.focus(); window.editor.setSelection(3); });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.fullscreenUI.isActive())).toBe(false);
  await page.evaluate(() => window.editor.setReadOnly(true));
  await expect(button(page)).toBeEnabled();
  await button(page).click();
  expect(await page.evaluate(() => window.fullscreenUI.isActive())).toBe(true);
  await button(page).click();
  expect(await html(page)).toBe('<p>Alpha text</p>');
  expect(await page.evaluate(() => window.changes.length)).toBe(0);
});

test('composition blocks entry and Escape and recovers after API or readonly cancellation without a native end event', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const blocked = window.fullscreenUI.enter();
    window.editor.setHTML('<p>Replacement</p>');
    const recovered = window.fullscreenUI.enter();
    window.fullscreenUI.exit();
    window.editor.focus();
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.setReadOnly(true);
    const readonly = window.fullscreenUI.enter();
    window.fullscreenUI.exit();
    window.editor.setReadOnly(false);
    return { blocked, recovered, readonly, html: window.editor.getHTML() };
  })).toEqual({ blocked: false, recovered: true, readonly: true, html: '<p>Replacement</p>' });
  await page.evaluate(() => {
    window.editor.focus();
    window.fullscreenUI.enter();
    window.editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    window.editor.surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true }));
  });
  expect(await page.evaluate(() => window.fullscreenUI.isActive())).toBe(true);
  await page.evaluate(() => window.editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.fullscreenUI.isActive())).toBe(false);
});

test('document ownership excludes a second workspace and overflow axes restore only still-owned values', async ({ page }) => {
  await initialize(page);
  expect(await page.evaluate(() => {
    const body = document.body;
    const original = body.getAttribute('style');
    const workspace = document.createElement('section');
    const host = document.createElement('div');
    const mount = document.createElement('div');
    workspace.append(host, mount);
    body.append(workspace);
    const otherEditor = window.createEditor(mount, { value: '<p>Other</p>' });
    const other = window.fullscreenModule.createFullscreenUI(host, otherEditor, { target: workspace });
    try {
      body.style.setProperty('overflow-x', 'scroll', 'important');
      body.style.setProperty('overflow-y', 'auto');
      const first = window.fullscreenUI.enter();
      const blocked = other.enter();
      const firstStillActive = window.fullscreenUI.isActive();
      body.style.setProperty('overflow-x', 'clip');
      window.fullscreenUI.exit();
      const restored = { x: body.style.getPropertyValue('overflow-x'), y: body.style.getPropertyValue('overflow-y'), xPriority: body.style.getPropertyPriority('overflow-x') };
      const nextOwner = other.enter();
      other.destroy();
      const released = { x: body.style.getPropertyValue('overflow-x'), y: body.style.getPropertyValue('overflow-y') };
      return { first, blocked, firstStillActive, nextOwner, restored, released, firstDocument: window.editor.getHTML(), secondDocument: otherEditor.getHTML() };
    }
    finally {
      other.destroy(); otherEditor.destroy(); workspace.remove();
      if (original === null) body.removeAttribute('style'); else body.setAttribute('style', original);
    }
  })).toEqual({ first: true, blocked: false, firstStillActive: true, nextOwner: true, restored: { x: 'clip', y: 'auto', xPriority: '' }, released: { x: 'clip', y: 'auto' }, firstDocument: '<p>Alpha text</p>', secondDocument: '<p>Other</p>' });
});

test('page scroll restores after fixed-layout clamping without overriding later application scrolling', async ({ page }) => {
  await initialize(page);
  const clamped = await page.evaluate(() => {
    const positioner = window.fullscreenPositioner;
    // Keep this fixture's page geometry independent of the default playground UI.
    for (const node of [...document.body.children]) {
      if (node !== positioner && node instanceof HTMLElement) node.hidden = true;
    }
    document.documentElement.style.scrollBehavior = 'auto';
    positioner.style.cssText = 'margin:0;max-width:none';
    const top = document.createElement('div');
    top.style.height = '500px';
    positioner.prepend(top);
    window.fullscreenWorkspace.style.height = '3000px';
    window.scrollTo(0, 700);
    const before = window.scrollY;
    const entered = window.fullscreenUI.enter();
    // The sole tall workspace now leaves page flow, so the background clamps.
    const locked = window.scrollY;
    window.fullscreenUI.exit();
    return { before, locked, entered };
  });
  expect(clamped.entered).toBe(true);
  expect(clamped.before).toBeGreaterThan(0);
  expect(clamped.locked).toBeLessThan(clamped.before);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(clamped.before);
  const applicationScroll = await page.evaluate(() => {
    const tail = document.createElement('div');
    tail.style.height = '2500px';
    window.fullscreenPositioner.append(tail);
    window.scrollTo(0, 700);
    const before = window.scrollY;
    window.fullscreenUI.enter();
    const locked = window.scrollY;
    window.scrollTo(0, 150);
    const requested = window.scrollY;
    window.fullscreenUI.exit();
    return { before, locked, requested };
  });
  expect(applicationScroll.requested).not.toBe(applicationScroll.locked);
  expect(applicationScroll.requested).not.toBe(applicationScroll.before);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(applicationScroll.requested);
  expect(await page.evaluate(() => ({ html: window.editor.getHTML(), undo: window.editor.canUndo(), changes: window.changes.length })))
    .toEqual({ html: '<p>Alpha text</p>', undo: false, changes: 0 });
});

test('ancestor detachment, adoption and editor disposal release mode and cannot revive retained controls', async ({ page }) => {
  await initialize(page);
  await page.evaluate(() => { window.fullscreenUI.enter(); window.fullscreenPositioner.remove(); });
  await expect.poll(() => page.evaluate(() => window.fullscreenUI.isActive())).toBe(false);
  expect(await page.evaluate(() => document.body.style.getPropertyValue('overflow-y'))).not.toBe('hidden');
  await page.evaluate(async () => {
    document.body.prepend(window.fullscreenPositioner);
    window.fullscreenUI.enter();
    const frame = document.createElement('iframe');
    frame.dataset.fullscreenAdoption = '';
    const loaded = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
    document.body.append(frame);
    await loaded;
    frame.contentDocument!.body.append(window.fullscreenWorkspace);
  });
  await expect.poll(() => page.evaluate(() => window.fullscreenUI.isActive())).toBe(false);
  expect(await page.evaluate(() => window.fullscreenUI.enter())).toBe(false);
  await page.evaluate(() => {
    window.fullscreenPositioner.append(window.fullscreenWorkspace);
    document.querySelector('[data-fullscreen-adoption]')!.remove();
    window.fullscreenUI.enter();
    window.editor.destroy();
    window.fullscreenUI.element.click();
  });
  expect(await page.evaluate(() => ({ locked: document.body.style.getPropertyValue('overflow-y') === 'hidden', classed: window.fullscreenWorkspace.classList.contains('mw-fullscreen') })))
    .toEqual({ locked: false, classed: false });
  expect(await page.evaluate(() => {
    let rejected = 0;
    for (const operation of [() => window.fullscreenUI.enter(), () => window.fullscreenUI.exit(), () => window.fullscreenUI.toggle(), () => window.fullscreenUI.isActive(), () => window.fullscreenUI.refresh()]) {
      try { operation(); } catch { rejected++; }
    }
    window.fullscreenUI.destroy();
    return rejected;
  })).toBe(5);
});

test('malformed setup is atomic and throwing notifications cannot prevent stable mode or cleanup', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await initialize(page);
  expect(await page.evaluate(() => {
    window.fullscreenUI.destroy();
    const host = window.fullscreenControlHost;
    const target = window.fullscreenWorkspace;
    const before = { html: window.editor.getHTML(), host: host.innerHTML, body: document.body.getAttribute('style') };
    const rejected: boolean[] = [];
    const invalid = [{}, { target: window.editor.surface }, { target, onChange: 'invalid' }, { target, onError: false }, { target, unsupported: true }];
    for (const options of invalid) {
      try { window.fullscreenModule.createFullscreenUI(host, window.editor, options as never); rejected.push(false); }
      catch { rejected.push(true); }
    }
    window.fullscreenPositioner.style.transform = 'translateX(0px)';
    try { window.fullscreenModule.createFullscreenUI(host, window.editor, { target }); rejected.push(false); }
    catch { rejected.push(true); }
    window.fullscreenPositioner.style.removeProperty('transform');
    const originalParent = window.editor.element.parentElement!;
    const shadowOwner = document.createElement('div');
    document.body.append(shadowOwner);
    const shadowTarget = document.createElement('section');
    const shadowHost = document.createElement('div');
    shadowTarget.append(shadowHost, window.editor.element);
    shadowOwner.attachShadow({ mode: 'open' }).append(shadowTarget);
    let unexpected: typeof window.fullscreenUI | undefined;
    try { unexpected = window.fullscreenModule.createFullscreenUI(shadowHost, window.editor, { target: shadowTarget }); rejected.push(false); }
    catch { rejected.push(true); }
    finally { unexpected?.destroy(); originalParent.append(window.editor.element); shadowOwner.remove(); }
    const atomic = before.html === window.editor.getHTML() && before.host === host.innerHTML && before.body === document.body.getAttribute('style');
    const states: boolean[] = [];
    const errors: unknown[] = [];
    let ui: typeof window.fullscreenUI;
    ui = window.fullscreenModule.createFullscreenUI(host, window.editor, {
      target,
      onChange: (active) => {
        states.push(ui.isActive() === active);
        if (active) window.editor.setHTML('<p>Callback replacement</p>');
        throw new Error('Application notification failure');
      },
      onError: (error) => { errors.push(error); throw new Error('Application diagnostic failure'); },
    });
    window.fullscreenUI = ui;
    const entered = ui.enter();
    ui.exit();
    return { rejected, atomic, states, errorCount: errors.length, entered, active: ui.isActive(), html: window.editor.getHTML(), undo: window.editor.canUndo(), locked: document.body.style.getPropertyValue('overflow-y') === 'hidden' };
  })).toEqual({ rejected: Array(7).fill(true), atomic: true, states: [true, true], errorCount: 2, entered: true, active: false, html: '<p>Callback replacement</p>', undo: false, locked: false });
  await page.evaluate(() => {
    window.fullscreenUI.destroy();
    const outside = document.querySelector<HTMLInputElement>('[aria-label="Outside fullscreen workspace"]')!;
    window.editor.focus();
    window.editor.setSelection(3);
    window.fullscreenUI = window.fullscreenModule.createFullscreenUI(window.fullscreenControlHost, window.editor, {
      target: window.fullscreenWorkspace,
      onChange: () => outside.focus(),
    });
    window.fullscreenUI.element.focus();
    window.fullscreenUI.element.click();
  });
  await expect(page.getByLabel('Outside fullscreen workspace', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.fullscreenUI.isActive())).toBe(true);
  await page.evaluate(() => { window.fullscreenUI.element.focus(); window.fullscreenUI.element.click(); });
  await expect(page.getByLabel('Outside fullscreen workspace', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.fullscreenUI.isActive())).toBe(false);
  expect(await html(page)).toBe('<p>Callback replacement</p>');
  expect(await page.evaluate(() => {
    window.fullscreenUI.destroy();
    let teardownNotifications = 0;
    const root = window.editor.surface;
    window.fullscreenUI = window.fullscreenModule.createFullscreenUI(window.fullscreenControlHost, window.editor, {
      target: window.fullscreenWorkspace,
      onChange: (active) => {
        if (active) return;
        teardownNotifications++;
        // Trusted notifications can synchronously dispatch native events while
        // editor destruction is still unwinding the controller's listeners.
        root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      },
    });
    window.fullscreenUI.enter();
    window.editor.destroy();
    return { teardownNotifications, locked: document.body.style.getPropertyValue('overflow-y') === 'hidden', classed: window.fullscreenWorkspace.classList.contains('mw-fullscreen'), controls: window.fullscreenControlHost.childNodes.length };
  })).toEqual({ teardownNotifications: 1, locked: false, classed: false, controls: 0 });
  // Allow event-dispatch exception reporting to reach Playwright before checking.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(pageErrors).toEqual([]);
});
