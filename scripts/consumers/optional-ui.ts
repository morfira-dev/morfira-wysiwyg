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
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof createFullscreenUI, 'function');
    assert.equal(typeof createSpecialCharacterUI, 'function');
  `], { cwd: temporary });
  const fixture = join(temporary, 'consumer.ts');
  await writeFile(fixture, await readFile(join(repository, 'scripts/consumers/optional-ui.fixture.ts')));
  const javascript = await build({
    entryPoints: [fixture], absWorkingDir: temporary, bundle: true, minify: true,
    write: false, metafile: true, platform: 'browser', format: 'esm', target: 'es2022',
    tsconfigRaw: { compilerOptions: {} }, logLevel: 'silent',
  });
  for (const input of Object.keys(javascript.metafile!.inputs)) {
    assert.ok(!input.includes('/packages/') && !input.startsWith('packages/'), `Unexpected workspace source or artifact alias: ${input}`);
  }
  const stylesheet = await build({
    stdin: { contents: "@import '@morfira-dev/wysiwyg/style.css'; @import '@morfira-dev/wysiwyg/ui/special-characters.css'; @import '@morfira-dev/wysiwyg/ui/fullscreen.css';", resolveDir: temporary, loader: 'css' },
    bundle: true, minify: true, write: false, logLevel: 'silent',
  });
  const site = join(temporary, 'site');
  await mkdir(site);
  await writeFile(join(site, 'consumer.js'), javascript.outputFiles[0].contents);
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
      await page.getByRole('button', { name: /Consumer euro/ }).click();
      await expect(content).toHaveText('A€B');
      await page.evaluate(() => window.morfiraOptionalUI.editor.undo());
      await expect(content).toHaveText('AB');
      assert.equal(await page.evaluate(() => window.morfiraOptionalUI.fullscreen.enter()), true);
      await expect(page.locator('[data-optional-workspace]')).toHaveClass(/mw-fullscreen/);
      await content.focus();
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.morfiraOptionalUI.fullscreen.isActive()), false);
      await expect(content).toHaveText('AB');
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
  console.log('Focused optional UI archive consumer passed: SSR import, public JS/CSS, literal insertion/Undo, fullscreen/Escape and cleanup (Chromium only).');
}
finally {
  await rm(temporary, { recursive: true, force: true });
}
