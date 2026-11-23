import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { serveConsumer } from './server.js';
import type {} from './optional-ui.types.js';

// A deliberately focused archive consumer: no framework installs or broad matrix.
const repository = resolve('.');
const temporary = await mkdtemp(join(tmpdir(), 'morfira-optional-ui-'));
try {
  const archives = join(temporary, 'archives');
  await mkdir(archives);
  for (const name of ['core', 'plugins', 'wysiwyg']) {
    const directory = join(repository, 'packages', name);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as { name: string; version: string };
    execFileSync('pnpm', ['pack', '--pack-destination', archives], { cwd: directory, stdio: 'pipe' });
    const archive = `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`;
    assert.ok((await readdir(archives)).includes(archive), `Missing actual archive for ${manifest.name}`);
    const destination = join(temporary, 'node_modules', manifest.name);
    await mkdir(destination, { recursive: true });
    execFileSync('tar', ['-xzf', join(archives, archive), '--strip-components=1', '-C', destination]);
  }
  execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    const { createFullscreenUI } = await import('@morfira-dev/wysiwyg/ui/fullscreen');
    const { createSpecialCharacterUI } = await import('@morfira-dev/wysiwyg/ui/special-characters');
    const { createPreviewUI } = await import('@morfira-dev/wysiwyg/ui/preview');
    const { saveState } = await import('@morfira-dev/wysiwyg/plugins/save-state');
    const { createSaveStateUI } = await import('@morfira-dev/wysiwyg/ui/save-state');
    const { createPrintUI } = await import('@morfira-dev/wysiwyg/ui/print');
    const { createOutlineUI } = await import('@morfira-dev/wysiwyg/ui/outline');
    assert.equal(typeof createPrintUI, 'function');
    assert.equal(typeof createOutlineUI, 'function');
    const { autolink } = await import('@morfira-dev/wysiwyg/plugins/autolink');
    const { tableProperties } = await import('@morfira-dev/wysiwyg/plugins/table-properties');
    const { textDrop } = await import('@morfira-dev/wysiwyg/plugins/text-drop');
    assert.equal(typeof textDrop().setup, 'function');
    assert.equal(typeof autolink({ email: true }).setup, 'function');
    assert.equal(typeof tableProperties().setup, 'function');
    assert.equal(typeof createPreviewUI, 'function');
    assert.equal(typeof saveState, 'function');
    assert.equal(typeof createSaveStateUI, 'function');
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof createFullscreenUI, 'function');
    assert.equal(typeof createSpecialCharacterUI, 'function');
    const { createStandardEditorUI } = await import('@morfira-dev/wysiwyg/ui/standard');
    const { createStandardPreset } = await import('@morfira-dev/wysiwyg/presets/standard');
    const { createTablePicker } = await import('@morfira-dev/wysiwyg/ui/table-picker');
    assert.equal(typeof createStandardEditorUI, 'function');
    assert.equal(typeof createStandardPreset, 'function');
    assert.equal(typeof createTablePicker, 'function');
  `], { cwd: temporary });
  const fixture = join(temporary, 'consumer.ts');
  await writeFile(fixture, await readFile(join(repository, 'scripts/consumers/optional-ui.fixture.ts')));
  await writeFile(join(temporary, 'optional-ui.types.ts'), await readFile(join(repository, 'scripts/consumers/optional-ui.types.ts')));
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', fixture], { cwd: temporary, stdio: 'pipe' });
  const javascript = await build({
    entryPoints: [fixture], absWorkingDir: temporary, bundle: true, minify: true,
    write: false, metafile: true, platform: 'browser', format: 'esm', target: 'es2022',
    tsconfigRaw: { compilerOptions: {} }, logLevel: 'silent',
  });
  for (const input of Object.keys(javascript.metafile!.inputs)) {
    assert.ok(!input.includes('/packages/') && !input.startsWith('packages/'), `Unexpected workspace source or artifact alias: ${input}`);
  }
  const stylesheet = await build({
    stdin: { contents: "@import '@morfira-dev/wysiwyg/style.css'; @import '@morfira-dev/wysiwyg/ui/special-characters.css'; @import '@morfira-dev/wysiwyg/ui/fullscreen.css'; @import '@morfira-dev/wysiwyg/ui/preview.css'; @import '@morfira-dev/wysiwyg/ui/save-state.css'; @import '@morfira-dev/wysiwyg/ui/print.css'; @import '@morfira-dev/wysiwyg/ui/outline.css'; @import '@morfira-dev/wysiwyg/ui/forms.css'; @import '@morfira-dev/wysiwyg/ui/editor.css'; @import '@morfira-dev/wysiwyg/ui/table-picker.css'; @import '@morfira-dev/wysiwyg/ui/contextual-link.css'; @import '@morfira-dev/wysiwyg/ui/contextual-image.css';", resolveDir: temporary, loader: 'css' },
    bundle: true, minify: true, write: false, logLevel: 'silent',
  });
  const site = join(temporary, 'site');
  await mkdir(site);
  await writeFile(join(site, 'consumer.js'), javascript.outputFiles[0].contents);
  await writeFile(join(site, 'context-image.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGz0AAAAASUVORK5CYII=', 'base64'));
  await writeFile(join(site, 'consumer.css'), stylesheet.outputFiles[0].contents);
  await writeFile(join(site, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><link rel="stylesheet" href="/consumer.css"><body><script type="module" src="/consumer.js"></script></body></html>');
  const server = await serveConsumer(site);
  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${server.url}/index.html`);
      const content = page.locator('.mw-content');
      await expect(content).toHaveText('AB');
      assert.deepEqual(await page.evaluate(() => {
        const editor = window.morfiraOptionalUI.editor;
        editor.setSelection(0, 1);
        const handle = editor.selection.capture();
        if (!handle) throw new Error('Installed selection SDK did not capture.');
        const field = document.createElement('input');
        document.body.append(field);
        field.focus();
        const range = editor.selection.getRange(handle);
        range?.collapse(false);
        const restored = editor.selection.restore(handle);
        const selection = editor.getSelection();
        editor.selection.release(handle);
        const released = editor.selection.isCurrent(handle);
        field.remove();
        editor.setSelection(1);
        return { restored, selection, released, undo: editor.canUndo() };
      }), { restored: true, selection: { index: 0, length: 1 }, released: false, undo: false });
      await page.getByRole('button', { name: /Consumer euro/ }).click();
      await expect(content).toHaveText('A€B');
      assert.equal(await page.evaluate(() => window.morfiraOptionalUI.saveState.getState().dirty), true);
      assert.equal(await page.evaluate(() => window.morfiraOptionalUI.saveState.save()), true);
      assert.equal(await page.evaluate(() => window.morfiraOptionalUI.getSaveCalls()), 1);
      assert.equal(await page.evaluate(() => window.morfiraOptionalUI.saveState.getState().status), 'saved');
      await page.evaluate(() => window.morfiraOptionalUI.preview.open());
      await expect(page.locator('.mw-preview-content')).toHaveText('A€B');
      await expect(content).toHaveText('A€B');
      await page.evaluate(() => window.morfiraOptionalUI.preview.close());
      await page.evaluate(() => window.morfiraOptionalUI.editor.undo());
      await expect(content).toHaveText('AB');
      assert.equal(await page.evaluate(() => window.morfiraOptionalUI.fullscreen.enter()), true);
      await expect(page.locator('[data-optional-workspace]')).toHaveClass(/mw-fullscreen/);
      await content.focus();
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.morfiraOptionalUI.fullscreen.isActive()), false);
      await expect(content).toHaveText('AB');
      await page.evaluate(() => window.morfiraOptionalUI.setupFeatures());
      const featureContent = page.locator('[data-feature-probe] .mw-content');
      await page.keyboard.type('User+tag@example.com ');
      await expect(featureContent.locator('a')).toHaveAttribute('href', 'mailto:User+tag@example.com');
      await expect(featureContent.locator('td').first()).toHaveAttribute('dir', 'rtl');
      await expect(featureContent.locator('td').first()).toHaveCSS('text-align', 'center');
      await page.evaluate(() => window.morfiraOptionalUI.setupReading());
      await page.locator('[data-reading-probe] .mw-outline button').click();
      assert.deepEqual(await page.evaluate(() => {
        const selection = document.getSelection();
        const node = selection?.anchorNode;
        const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
        return { heading: element?.closest('h2')?.textContent, collapsed: selection?.isCollapsed, offset: selection?.anchorOffset };
      }), { heading: 'Section', collapsed: true, offset: 0 });
      assert.deepEqual(await page.evaluate(() => {
        const reader = window.morfiraOptionalUI.getReading();
        const originalPrint = window.print;
        let calls = 0;
        let text = '';
        window.print = () => {
          calls++;
          text = document.querySelector('[data-mw-print-surface]')?.textContent ?? '';
          window.dispatchEvent(new Event('afterprint'));
        };
        try {
          return { accepted: reader.print.print(), calls, text,
            pending: reader.print.isPrinting(), undo: reader.editor.canUndo(),
            lease: document.body.hasAttribute('data-mw-print-active') };
        }
        finally { window.print = originalPrint; }
      }), { accepted: true, calls: 1, text: 'SectionBody', pending: false, undo: false, lease: false });
      assert.deepEqual(await page.evaluate(() => {
        const editor = window.morfiraOptionalUI.getReading().editor;
        const source = editor.surface.querySelector('p')!;
        const heading = editor.surface.querySelector('h2')!;
        editor.focus();
        const selection = document.getSelection()!;
        const range = document.createRange();
        range.selectNodeContents(source);
        selection.removeAllRanges();
        selection.addRange(range);
        const transfer = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true, cancelable: true }));
        const destination = document.createRange();
        destination.setStart(heading.firstChild!, heading.firstChild!.textContent!.length);
        destination.collapse(true);
        const box = destination.getBoundingClientRect();
        heading.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, clientX: box.left + 1,
          clientY: box.top + box.height / 2, bubbles: true, cancelable: true }));
        source.dispatchEvent(new DragEvent('dragend', { dataTransfer: transfer, bubbles: true }));
        const moved = [heading.textContent, source.textContent, editor.canUndo()];
        editor.undo();
        return { moved, restored: [...editor.surface.children].map((block) => block.textContent), undo: editor.canUndo() };
      }), { moved: ['SectionBody', '', true], restored: ['Section', 'Body'], undo: false });
      await page.evaluate(() => {
        const reader = window.morfiraOptionalUI.getReading();
        reader.editor.setHTML('<p>Before <a href="/first" title="First">One</a> between <a href="/second" title="Second">Two</a> after</p><figure><img src="/context-image.png" width="80" height="50" alt="Archive image"><figcaption>Caption</figcaption></figure>');
        reader.editor.focus();
        const paragraph = reader.editor.surface.querySelector('p')!;
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        document.getSelection()!.removeAllRanges();
        document.getSelection()!.addRange(range);
        reader.links.refresh();
      });
      const mixed = page.locator('[data-reading-probe] .mw-contextual-link');
      await expect(mixed).toBeVisible();
      await expect(mixed.locator('[data-mw-link-action="open"]')).toBeHidden();
      await mixed.locator('[data-mw-link-action="remove"]').click();
      await expect(page.locator('[data-reading-probe] .mw-content p a')).toHaveCount(0);
      await page.evaluate(() => {
        const reader = window.morfiraOptionalUI.getReading();
        reader.editor.undo();
      });
      await expect(page.locator('[data-reading-probe] .mw-content p a')).toHaveCount(2);
      await page.locator('[data-reading-probe] figcaption').scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const reader = window.morfiraOptionalUI.getReading();
        const text = reader.editor.surface.querySelector('figcaption')!.firstChild!;
        reader.editor.focus();
        document.getSelection()!.setBaseAndExtent(text, 2, text, 2);
        reader.image.refresh();
      });
      const imageContext = page.locator('[data-reading-probe] .mw-contextual-image');
      await expect(imageContext).toBeVisible();
      await imageContext.locator('[data-mw-image-action="remove"]').click();
      await expect(page.locator('[data-reading-probe] .mw-content figure')).toHaveCount(0);
      await page.evaluate(() => window.morfiraOptionalUI.getReading().editor.undo());
      await expect(page.locator('[data-reading-probe] .mw-content figcaption')).toHaveText('Caption');
      await page.evaluate(() => window.morfiraOptionalUI.setupFloating());
      const floating = page.locator('[data-floating-probe]');
      const floatingContent = floating.locator('.mw-content');
      const floatingPanel = floating.locator('.mw-ui-panel');
      const floatingLink = floating.locator('[data-mw-ui-action="link"]');
      await floatingLink.click();
      await expect(floatingPanel).toHaveClass(/mw-ui-panel-popover/);
      await expect(floatingPanel).toHaveCSS('position', 'fixed');
      await floatingPanel.getByLabel('Link URL', { exact: true }).press('Escape');
      await expect(floatingPanel).toBeHidden();
      await expect(floatingLink).toBeFocused();
      await floating.locator('[data-mw-ui-action="table"]').click();
      await expect(floatingPanel).toHaveClass(/mw-ui-panel-popover/);
      await expect(floatingPanel.locator('.mw-table-picker')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(floatingPanel).toBeHidden();
      await floating.locator('[data-mw-ui-action="image"]').click();
      const imageDialog = floating.locator('dialog.mw-image-dialog');
      await expect(imageDialog).toBeVisible();
      await expect(imageDialog).toHaveJSProperty('open', true);
      await imageDialog.getByRole('button', { name: 'Insert image', exact: true }).click();
      await expect(imageDialog).toBeHidden();
      await expect(floatingContent.locator('img')).toHaveAttribute('alt', 'Archive dialog image');
      await page.evaluate(() => window.morfiraOptionalUI.getFloating().editor.undo());
      await expect(floatingContent).toHaveText('word word');
      await expect(floatingContent.locator('img')).toHaveCount(0);
      await floating.locator('[data-mw-ui-action="search"]').click();
      await expect(floatingPanel).toHaveClass(/mw-ui-search-docked/);
      await expect(floating.locator('dialog:modal')).toHaveCount(0);
      await floatingPanel.getByRole('button', { name: 'Find', exact: true }).click();
      await expect(floatingPanel.getByRole('status')).toHaveText('Match 1 of 2');
      await floatingContent.click();
      await expect(floatingContent).toBeFocused();
      await expect(floatingPanel).toBeVisible();
      await floatingPanel.getByRole('button', { name: 'Replace all', exact: true }).click();
      await expect(floatingContent).toHaveText('term term');
      await page.evaluate(() => window.morfiraOptionalUI.getFloating().editor.undo());
      await expect(floatingContent).toHaveText('word word');
      await floatingPanel.getByLabel('Find text', { exact: true }).press('Escape');
      await page.evaluate(() => {
        const probe = window.morfiraOptionalUI.getFloating();
        probe.editor.focus();
        probe.editor.setSelection(4);
        probe.characters.open();
      });
      const symbolDialog = floating.locator('dialog.mw-special-characters-dialog');
      await expect(symbolDialog).toBeVisible();
      await symbolDialog.getByRole('button', { name: /Archive euro/ }).click();
      await expect(symbolDialog).toBeHidden();
      await expect(floatingContent).toHaveText('word€ word');
      await page.evaluate(() => window.morfiraOptionalUI.getFloating().editor.undo());
      await expect(floatingContent).toHaveText('word word');
      await page.evaluate(() => window.morfiraOptionalUI.dispose());
      await expect(page.locator('.mw-editor')).toHaveCount(0);
      assert.deepEqual(errors, [], 'Installed optional UI must not emit browser errors.');
    }
    finally {
      await browser.close();
    }
  }
  finally {
    await server.close();
  }
  console.log('Focused optional UI archive consumer passed: SSR import, public JS/CSS, revision-bound selection handles, literal insertion/Undo, preview, save state, fullscreen/Escape, merged-cell typography, email completion, print/outline, text move/Undo, mixed-link/caption contexts, floating link/table panels, image/symbol dialogs, nonmodal search/replace and cleanup (Chromium only).');
}
finally {
  await rm(temporary, { recursive: true, force: true });
}
