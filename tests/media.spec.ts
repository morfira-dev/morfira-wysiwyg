import { expect, test } from '@playwright/test';
import { setupMedia } from './media.fixture.js';
import type {} from './media.types.js';

const youtube = 'https://youtu.be/dQw4w9WgXcQ';
const initial = '<figure data-mw-node="morfira:media" data-provider="youtube" data-video-id="dQw4w9WgXcQ">Example video</figure><p>After</p>';

test('media parser extracts allowlisted identities and rejects URL ambiguity', async ({ page }) => {
  await setupMedia(page);
  const result = await page.evaluate(async () => {
    const path = '/packages/plugins/dist/media.js';
    const { parseMediaURL } = await import(/* @vite-ignore */ path) as typeof import('@morfira-dev/wysiwyg/plugins/media');
    const accepted = ['https://youtu.be/dQw4w9WgXcQ?t=3', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'https://vimeo.com/123456789', 'https://player.vimeo.com/video/123456789']
      .map((url) => parseMediaURL(url));
    const rejected = ['javascript:alert(1)', 'http://youtu.be/dQw4w9WgXcQ', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
      'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=aaaaaaaaaaa',
      'https://youtu.be/%64Qw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ/extra', 'https://vimeo.com/123456789?h=private',
      'https://player.vimeo.com/video/123456789/evil', 'https://youtu.be:444/dQw4w9WgXcQ'].map((url) => {
        try { parseMediaURL(url); return false; } catch { return true; }
      });
    return { accepted, rejected };
  });
  expect(result.accepted.map((value) => value.id)).toEqual(['dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'dQw4w9WgXcQ', '123456789', '123456789']);
  expect(result.rejected.every(Boolean)).toBe(true);
});

test('media edits preserve literal semantic data, history and reject stale targets', async ({ page }) => {
  await setupMedia(page);
  const result = await page.evaluate((url) => {
    const { editor, commands } = window.mediaProbe;
    const original = editor.getHTML();
    const inserted = commands.insert({ url, title: '<b>Literal title</b>' });
    const html = editor.getHTML();
    const json = editor.getJSON();
    const target = editor.surface.querySelector<HTMLElement>('figure')!;
    const updated = commands.update(target, { url: 'https://vimeo.com/123456789', title: 'Vimeo' });
    const changed = editor.getHTML();
    editor.undo();
    const undo = editor.getHTML() === html;
    editor.redo();
    const redo = editor.getHTML() === changed;
    const stale = commands.remove(target);
    const current = editor.surface.querySelector<HTMLElement>('figure')!;
    const removed = commands.remove(current);
    editor.undo();
    editor.setReadOnly(true);
    const readonly = commands.remove(editor.surface.querySelector<HTMLElement>('figure')!);
    editor.setReadOnly(false);
    editor.setHTML(original);
    return { inserted, html, json, updated, undo, redo, stale, removed, readonly, final: editor.getHTML() };
  }, youtube);
  expect(result).toMatchObject({ inserted: true, updated: true, undo: true, redo: true, stale: false, removed: true, readonly: false, final: '<p>Before</p>' });
  expect(result.html).toContain('&lt;b&gt;Literal title&lt;/b&gt;');
  expect(JSON.stringify(result.json)).not.toMatch(/iframe|youtu\.be|https:/);
});

test('media boundaries rebuild persisted wrappers and never import executable embeds', async ({ page }) => {
  await setupMedia(page);
  const result = await page.evaluate(() => {
    const { editor } = window.mediaProbe;
    editor.setHTML('<figure data-mw-node="morfira:media" data-provider="youtube" data-video-id="dQw4w9WgXcQ" src="https://evil.test" onclick="alert(1)">Title</figure><iframe src="https://evil.test"></iframe>');
    const safe = editor.getHTML();
    editor.setHTML('<figure data-mw-node="morfira:media" data-provider="youtube" data-video-id="bad">Invalid identity</figure>');
    window.mediaProbe.view.refresh();
    return { safe, invalidLoad: window.mediaProbe.view.element.querySelector<HTMLButtonElement>('button')?.disabled, frames: document.querySelectorAll('iframe').length };
  });
  expect(result.safe).toContain('data-video-id="dQw4w9WgXcQ"');
  expect(result.safe).not.toMatch(/iframe|onclick|evil\.test/);
  expect(result.invalidLoad).toBe(true);
  expect(result.frames).toBe(0);
});

test('external playback requires consent, uses exact iframe policy and unloads on update and destruction', async ({ page }) => {
  let requests = 0;
  await page.route('https://www.youtube-nocookie.com/**', async (route) => { requests++; await route.fulfill({ contentType: 'text/html', body: '<p>Provider fixture</p>' }); });
  await setupMedia(page, initial);
  await expect(page.getByRole('button', { name: 'Load external video', exact: true })).toBeVisible();
  expect(requests).toBe(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.evaluate(() => window.mediaProbe.editor.setReadOnly(true));
  await page.getByRole('button', { name: 'Load external video', exact: true }).click();
  const frame = page.locator('.mw-media-frame');
  await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  await expect(frame).toHaveAttribute('allow', 'fullscreen; picture-in-picture; encrypted-media');
  await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: 'Unload external video', exact: true }).click();
  await expect(frame).toHaveCount(0);
  await page.getByRole('button', { name: 'Load external video', exact: true }).click();
  await page.evaluate(() => {
    const { editor, commands } = window.mediaProbe;
    editor.setReadOnly(false);
    commands.update(editor.surface.querySelector<HTMLElement>('figure')!, { url: 'https://vimeo.com/123456789', title: 'Replacement' });
  });
  await expect(frame).toHaveCount(0);
  await expect(page.locator('.mw-media-card')).toContainText('Replacement');
  expect(await page.evaluate(() => window.mediaProbe.editor.getHTML())).not.toMatch(/iframe|sandbox|autoplay/);
  await page.evaluate(() => window.mediaProbe.editor.destroy());
  await expect(page.locator('.mw-media-card')).toHaveCount(0);
});

test('media dialog keeps invalid drafts correctable and inserts at captured selection', async ({ page }) => {
  await setupMedia(page);
  await page.evaluate(() => { window.mediaProbe.editor.setSelection(3); window.mediaProbe.form.open(); });
  await page.getByLabel('Media URL', { exact: true }).fill('https://evil.test/video');
  await page.getByLabel('Media title', { exact: true }).fill('New video');
  await page.getByRole('button', { name: 'Insert media', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('supported HTTPS');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Media URL', { exact: true }).fill(youtube);
  await page.getByRole('button', { name: 'Insert media', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.mw-content figure')).toHaveText('New video');
  expect(await page.evaluate(() => window.mediaProbe.editor.getHTML())).toContain('data-video-id="dQw4w9WgXcQ"');
});

test('media form rejects replacement, composition and retargeted selection drafts', async ({ page }) => {
  await setupMedia(page);
  const result = await page.evaluate((url) => {
    const { editor, form } = window.mediaProbe;
    editor.setSelection(1);
    form.open();
    form.setValues({ url, title: 'Stale' });
    editor.setHTML('<p>Replacement</p>');
    const closed = !form.isOpen();
    editor.setSelection(1);
    form.open();
    editor.surface.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    form.element.querySelector<HTMLButtonElement>('button')!.click();
    const composition = !editor.surface.querySelector('figure');
    editor.surface.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    form.close();
    editor.setSelection(1);
    form.open();
    editor.setSelection(4);
    form.element.querySelector<HTMLButtonElement>('button')!.click();
    const retarget = !editor.surface.querySelector('figure');
    form.close();
    return { closed, composition, retarget, html: editor.getHTML() };
  }, youtube);
  expect(result).toEqual({ closed: true, composition: true, retarget: true, html: '<p>Replacement</p>' });
});

test('media editing targets actual identity and external UI cleanup preserves application hosts', async ({ page }) => {
  await setupMedia(page, initial);
  const result = await page.evaluate(() => {
    const { editor, form, view } = window.mediaProbe;
    const target = editor.surface.querySelector<HTMLElement>('figure')!;
    document.getSelection()!.setBaseAndExtent(target.firstChild!, 1, target.firstChild!, 1);
    form.open();
    const values = form.getValues();
    form.setValues({ title: 'Edited title' });
    const buttons = [...form.element.querySelectorAll('button')];
    buttons[0]!.click();
    const edited = editor.getHTML();
    const current = editor.surface.querySelector<HTMLElement>('figure')!;
    document.getSelection()!.setBaseAndExtent(current.firstChild!, 0, current.firstChild!, 0);
    form.open();
    [...form.element.querySelectorAll('button')][1]!.click();
    const removed = !editor.surface.querySelector('figure');
    editor.undo();
    const restored = editor.getHTML();
    const parent = view.element.parentElement!;
    const marker = document.createElement('b');
    marker.textContent = 'Application owned';
    parent.append(marker);
    form.destroy();
    view.destroy();
    editor.destroy();
    return { values, edited, removed, restored, marker: marker.isConnected, dialogs: parent.querySelectorAll('dialog').length, views: parent.querySelectorAll('.mw-media-views').length };
  });
  expect(result.values).toEqual({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Example video' });
  expect(result.edited).toContain('Edited title');
  expect(result).toMatchObject({ removed: true, marker: true, dialogs: 0, views: 0 });
  expect(result.restored).toContain('Edited title');
});
