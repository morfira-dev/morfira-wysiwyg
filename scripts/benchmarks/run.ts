import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { benchmarkParagraphCounts, createBenchmarkFixture } from './fixtures.js';
import type { BenchmarkFixture } from './types.js';
import type { BenchmarkBrowser, BenchmarkCase, BenchmarkProfile, HeapMetrics, HistoryObservation, SampleSummary } from './runner.types.js';
import type {} from './browser.js';

const options = new Map(process.argv.slice(2).filter((argument) => argument !== '--').map((argument) => {
  const [name, ...parts] = argument.replace(/^--/, '').split('=');
  return [name, parts.join('=')];
}));
for (const name of options.keys()) assert.ok(['browser', 'repeats', 'profiles', 'sizes', 'heap', 'timeout'].includes(name), `Unknown option: ${name}`);
const repeats = Number(options.get('repeats') ?? 5);
assert.ok(Number.isInteger(repeats) && repeats >= 5 && repeats <= 20, 'Use 5–20 repetitions.');
const browserNames = (options.get('browser') ?? 'chromium').split(',');
assert.ok(browserNames.every((name) => ['chromium', 'firefox', 'webkit'].includes(name)), 'Use chromium,firefox,webkit.');
const profiles = (options.get('profiles') ?? 'core').split(',');
assert.ok(profiles.every((name) => ['core', 'search', 'statistics'].includes(name)), 'Use core,search,statistics.');
const sizes = (options.get('sizes') ?? '100,1000,5000').split(',').map(Number);
assert.ok(sizes.every((size) => benchmarkParagraphCounts.includes(size as 100 | 1000 | 5000)), 'Use sizes 100,1000,5000.');
assert.ok(!options.has('heap') || ['true', 'false'].includes(options.get('heap')!), 'heap must be true or false.');
const timeoutMs = Number(options.get('timeout') ?? 120000);
assert.ok(Number.isInteger(timeoutMs) && timeoutMs >= 10000 && timeoutMs <= 300000, 'timeout must be 10000–300000 milliseconds per sample.');
const heapEnabled = options.get('heap') !== 'false';
const summary = (samples: number[]): SampleSummary => {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    samples,
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1)!,
  };
};
const candidateInputs: Record<string, string> = {};
const snapshotBuild = async (directory: string): Promise<void> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await snapshotBuild(path);
    else if (/\.(js|css)$/.test(path)) candidateInputs[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
};
for (const folder of ['core', 'plugins', 'wysiwyg']) await snapshotBuild(`packages/${folder}/dist`);
candidateInputs['scripts/benchmarks/browser.ts'] = createHash('sha256').update(await readFile('scripts/benchmarks/browser.ts')).digest('hex');
const assets = await build({
  entryPoints: ['scripts/benchmarks/browser.ts'], outfile: 'benchmark.js',
  bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', write: false,
  tsconfigRaw: { compilerOptions: {} }, metafile: true,
});
assert.ok(!Object.keys(assets.metafile!.inputs).some((path) => /^packages\/[^/]+\/src\//.test(path)), 'Benchmark must use built public artifacts, not workspace source aliases.');
const bundledInputs = Object.fromEntries(await Promise.all(Object.keys(assets.metafile!.inputs).map(async (path) => {
  const digest = createHash('sha256').update(await readFile(path)).digest('hex');
  assert.equal(digest, candidateInputs[path], `Benchmark build input changed or was not an expected public artifact: ${path}`);
  return [path, digest];
})));
const js = assets.outputFiles.find((file) => file.path.endsWith('.js'))!.contents;
const css = assets.outputFiles.find((file) => file.path.endsWith('.css'))!.contents;
const server = createServer((request, response) => {
  const route = request.url;
  if (route === '/benchmark.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js); }
  else if (route === '/benchmark.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
  else if (route === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/benchmark.css"><style>body{margin:0}#benchmark{width:1000px;margin:16px auto}</style></head><body><div id="benchmark"></div><script type="module" src="/benchmark.js"></script></body></html>');
  } else { response.statusCode = 404; response.end(); }
});
let url = '';
const sample = async (page: Page, fixture: BenchmarkFixture, profile: BenchmarkProfile): Promise<Record<string, number>> => {
  const metrics: Record<string, number> = {};
  metrics.create = await page.evaluate(({ html, profile }) => window.morfiraBenchmark.mount(html, profile), { html: fixture.html, profile });
  try {
    await page.evaluate((fixture) => window.morfiraBenchmark.verify(fixture), fixture);
    metrics.exportHTML = await page.evaluate(() => window.morfiraBenchmark.exportHTML());
    metrics.selectEnd = await page.evaluate((length) => window.morfiraBenchmark.select(length), fixture.expected.textLength);
    metrics.selectStart = await page.evaluate(({ index, length }) => window.morfiraBenchmark.select(index, length), fixture.target);
    await page.evaluate(() => window.morfiraBenchmark.replace('<p>Import baseline</p>'));
    metrics.importHTML = await page.evaluate((html) => window.morfiraBenchmark.replace(html), fixture.html);
    await page.evaluate((fixture) => window.morfiraBenchmark.verify(fixture), fixture);
    if (profile === 'search') metrics.searchQuery = await page.evaluate(({ query, matches }) => window.morfiraBenchmark.search(query, matches), fixture.search);
    const baseline = await page.evaluate(() => window.morfiraBenchmark.html());
    metrics.format = await page.evaluate(() => window.morfiraBenchmark.format());
    await page.evaluate(({ target, expected }) => window.morfiraBenchmark.verifyFormatted(target, expected), { target: fixture.target.text, expected: fixture.expected.textContent });
    const formatted = await page.evaluate(() => window.morfiraBenchmark.html());
    const expectedFormat = baseline.replace(`<p>${fixture.target.text}`, `<p><strong>${fixture.target.text}</strong>`);
    assert.notEqual(expectedFormat, baseline, 'The known formatting target must exist.');
    assert.equal(formatted, expectedFormat, 'Formatting must change only the expected target.');
    metrics.undo = await page.evaluate(() => window.morfiraBenchmark.undo());
    assert.equal(await page.evaluate(() => window.morfiraBenchmark.html()), baseline, 'Undo must restore document.');
    metrics.redo = await page.evaluate(() => window.morfiraBenchmark.redo());
    assert.equal(await page.evaluate(() => window.morfiraBenchmark.html()), formatted, 'Redo must restore formatting.');
    await page.evaluate(() => window.morfiraBenchmark.undo());
    await page.evaluate(() => window.morfiraBenchmark.armInput());
    const wallStart = performance.now();
    await page.keyboard.type('x');
    metrics.nativeAutomationWall = performance.now() - wallStart;
    const input = await page.evaluate(() => window.morfiraBenchmark.finishInput());
    await page.evaluate((expected) => window.morfiraBenchmark.verifyNativeInput(expected), fixture.expected.textContent);
    metrics.nativeDispatch = input.dispatchMs;
    metrics.nativeFrameOpportunity = input.frameOpportunityMs;
    await page.evaluate(() => window.morfiraBenchmark.undo());
    assert.equal(await page.evaluate(() => window.morfiraBenchmark.html()), baseline, 'Native input undo must restore document.');
    metrics.dispose = await page.evaluate(() => window.morfiraBenchmark.dispose());
    return metrics;
  } catch (error) {
    await page.evaluate(() => { try { window.morfiraBenchmark.dispose(); } catch { /* Preserve the original measurement failure. */ } }).catch(() => {});
    throw error;
  }
};
const heap = async (session: CDPSession): Promise<HeapMetrics> => {
  await session.send('HeapProfiler.collectGarbage');
  const result = await session.send('Performance.getMetrics');
  const values = new Map(result.metrics.map((metric) => [metric.name, metric.value]));
  for (const name of ['JSHeapUsedSize', 'Nodes', 'Documents', 'JSEventListeners']) assert.ok(values.has(name), `Missing CDP metric ${name}`);
  return { jsHeapUsed: values.get('JSHeapUsedSize')!, domNodes: values.get('Nodes')!, documents: values.get('Documents')!, listeners: values.get('JSEventListeners')! };
};
const observeHistory = async (page: Page, session: CDPSession): Promise<HistoryObservation[]> => {
  const fixture = createBenchmarkFixture(1000);
  const results: HistoryObservation[] = [];
  for (const historyLimit of [5, 20]) {
    await page.evaluate(({ html, historyLimit }) => window.morfiraBenchmark.mount(html, 'core', historyLimit), { html: fixture.html, historyLimit });
    try {
      await page.evaluate((fixture) => window.morfiraBenchmark.verify(fixture), fixture);
      const before = await heap(session);
      await page.evaluate(() => window.morfiraBenchmark.history(20));
      const edited = await heap(session);
      await page.evaluate((expected) => window.morfiraBenchmark.verifyHistory(expected), Math.min(historyLimit, 20));
      await page.evaluate(() => window.morfiraBenchmark.clearHistory());
      const cleared = await heap(session);
      await page.evaluate(() => window.morfiraBenchmark.dispose());
      const destroyed = await heap(session);
      results.push({ historyLimit, edits: 20, before, edited, cleared, destroyed, restoredUndoSteps: Math.min(historyLimit, 20) });
    } catch (error) {
      await page.evaluate(() => { try { window.morfiraBenchmark.dispose(); } catch { /* Cleanup remains best effort after failure. */ } }).catch(() => {});
      throw error;
    }
  }
  return results;
};
const libraryArtifacts: Record<string, string> = {};
for (const folder of ['core', 'plugins']) {
  for (const file of (await readdir(`packages/${folder}/dist`)).filter((name) => name.endsWith('.js')).sort()) {
    libraryArtifacts[`${folder}/${file}`] = createHash('sha256').update(await readFile(`packages/${folder}/dist/${file}`)).digest('hex');
  }
}
const deadline = async <T>(operation: Promise<T>, label: string, stop: () => Promise<void>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        void stop().catch(() => {});
        reject(new Error(`Operational timeout after ${timeoutMs} ms: ${label}. This sample is incomplete.`));
      }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
};
const report = {
  version: 1, status: 'running' as 'running' | 'passed' | 'failed', failure: undefined as string | undefined, createdAtUTC: new Date().toISOString(),
  source: { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) },
  environment: { platform: platform(), osRelease: release(), architecture: arch(), cpu: cpus()[0]?.model, logicalCPUs: cpus().length, node: process.version, viewport: { width: 1280, height: 720 }, build: 'minified public package imports', automationTransport: 'Playwright loopback browser server', bundleSHA256: createHash('sha256').update(js).digest('hex'), cssBundleSHA256: createHash('sha256').update(css).digest('hex') },
  libraryArtifacts, bundledInputs,
  sampling: { warmups: 1, repeats, timeoutMs, thresholds: 'observational; no timing CI gate' },
  definitions: { commands: 'Page performance.now around synchronous public API, selection setup outside formatting timer.', nativeDispatch: 'Capture beforeinput to bubble input listener after core; includes browser editing and synchronous core/plugin handlers.', nativeFrameOpportunity: 'Capture beforeinput to first requestAnimationFrame after input; scheduling proxy, not proof of painted pixels.', nativeAutomationWall: 'Node wall time around Playwright keyboard.type; includes IPC/automation.', heap: 'Optional Chromium Performance.getMetrics after explicit HeapProfiler.collectGarbage; renderer observations, not editor-owned bytes or a leak proof.' },
  packages: Object.fromEntries(await Promise.all(['core', 'plugins'].map(async (name) => [name, (JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8')) as { version: string }).version]))),
  browsers: [] as { name: BenchmarkBrowser; version: string; cases: BenchmarkCase[]; history: HistoryObservation[] | { unsupported: string } }[],
};
const persist = async () => {
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/performance-baseline.json.tmp', JSON.stringify(report, null, 2) + '\n');
  await rename('artifacts/performance-baseline.json.tmp', 'artifacts/performance-baseline.json');
};
try {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  url = `http://127.0.0.1:${address.port}`;
  await persist();
  for (const name of browserNames as BenchmarkBrowser[]) {
    const engine = ({ chromium, firefox, webkit })[name];
    const browserServer = await engine.launchServer({ headless: true, host: '127.0.0.1' });
    try {
      const browser = await engine.connect(browserServer.wsEndpoint());
      const page = await browser.newPage({ viewport: report.environment.viewport });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(url);
      await page.waitForFunction(() => Boolean(window.morfiraBenchmark));
      const cases: BenchmarkCase[] = [];
      const browserReport = { name, version: browser.version(), cases, history: { unsupported: 'History observations not completed.' } as HistoryObservation[] | { unsupported: string } };
      report.browsers.push(browserReport);
      await persist();
      for (const size of sizes) for (const profile of profiles as BenchmarkProfile[]) {
        const fixture = createBenchmarkFixture(size as 100 | 1000 | 5000);
        const label = `${name} ${fixture.id} ${profile}`;
        console.log(`${label}: warmup`);
        await deadline(sample(page, fixture, profile), `${label} warmup`, () => browserServer.kill());
        const runs: Record<string, number>[] = [];
        for (let index = 0; index < repeats; index++) {
          console.log(`${label}: sample ${index + 1}/${repeats}`);
          runs.push(await deadline(sample(page, fixture, profile), `${label} sample ${index + 1}`, () => browserServer.kill()));
        }
        const metrics = Object.fromEntries(Object.keys(runs[0]).map((key) => [key, summary(runs.map((run) => run[key]))]));
        cases.push({ fixture: fixture.id, paragraphs: size, profile, htmlUTF16Units: fixture.html.length, htmlUTF8Bytes: Buffer.byteLength(fixture.html), schemaNodes: fixture.expected.nodeCount, metrics });
        await persist();
        console.log(`${name} ${fixture.id} ${profile}: native dispatch median ${metrics.nativeDispatch.median.toFixed(1)} ms; format ${metrics.format.median.toFixed(1)} ms`);
      }
      let history: HistoryObservation[] | { unsupported: string } = { unsupported: name !== 'chromium' ? 'Chromium CDP heap metrics are unsupported in this browser.' : 'Heap observations disabled by option.' };
      if (name === 'chromium' && heapEnabled) {
        const session = await page.context().newCDPSession(page);
        try { await session.send('Performance.enable'); history = await deadline(observeHistory(page, session), `${name} history`, () => browserServer.kill()); }
        finally { await session.detach().catch(() => {}); }
      }
      assert.deepEqual(errors, [], 'The benchmark page must not have uncaught errors.');
      browserReport.history = history;
      await persist();
    } finally { await browserServer.kill().catch(() => {}); }
  }
  report.status = 'passed';
  await persist();
  console.log('Saved artifacts/performance-baseline.json; timings are local observations, not universal capacity guarantees.');
} catch (error) {
  report.status = 'failed';
  report.failure = error instanceof Error ? error.message : String(error);
  await persist();
  throw error;
} finally {
  if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
