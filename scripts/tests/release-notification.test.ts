import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectPackageChanges, notificationMessage } from '../release-notification-message.js';
import { notifyPublishedRelease, publishedReport } from '../release-notification.js';
import type { PublishedReleaseReport } from '../release-notification.types.js';

const hash = (number: number): string => number.toString(16).padStart(40, '0');
const report = (packages: PublishedReleaseReport['packages']): PublishedReleaseReport => ({
  version: 1, sourceSha: hash(1), runId: '123', runAttempt: '1', packages,
});

test('release changes retain labels, remove generated noise and bodies, and deduplicate hashes', () => {
  const changes = collectPackageChanges([
    { hash: hash(1), message: 'feat(core)!: <safe> & \u202Etext\n\nPrivate author/body is never rendered' },
    { hash: hash(1), message: 'fix: duplicate' },
    { hash: hash(2), message: 'chore(release): sync package versions [skip ci]' },
    { hash: hash(3), message: "Merge branch 'main'" },
    { hash: hash(4), message: 'fix(plugins): preserve range\n\nBREAKING CHANGE: schema upgrade' },
    { hash: 'https://example.invalid/', message: 'feat: invalid link' },
    { hash: hash(5), message: 'Untyped subject' },
  ]);
  assert.equal(changes.changeCount, 3);
  assert.deepEqual(changes.changes.map((commit) => commit.label), ['feat(core)!', 'fix(plugins)!', 'commit']);
  assert.equal(changes.changes[0].subject, '<safe> &  text');
  assert.equal(changes.changes[1].subject, 'preserve range');
});

test('notification groups package changes, links exact commits and escapes untrusted subjects', () => {
  const value = report([
    { name: '@morfira-dev/wysiwyg-core', version: '1.2.0', ...collectPackageChanges([{ hash: hash(3), message: 'feat(core): <b> & "input"' }]) },
    { name: '@morfira-dev/wysiwyg-vue', version: '1.2.0', changes: [], changeCount: 0 },
    { name: '@morfira-dev/wysiwyg', version: '1.2.0' },
  ]);
  const message = notificationMessage(publishedReport(value));
  assert.match(message.html, /feat\(core\): &lt;b&gt; &amp; &quot;input&quot;/);
  assert.ok(message.html.includes(`/commit/${hash(3)}`));
  assert.ok(message.html.includes('/releases/tag/%40morfira-dev%2Fwysiwyg-core%401.2.0'));
  assert.equal(message.text.match(/feat\(core\)/g)?.length, 1);
  assert.match(message.text, /Обновление внутренних зависимостей/);
  assert.match(message.text, /Список изменений недоступен/);
});

test('large release keeps every package/version with fair bounded commit previews and omission counts', () => {
  const packages = ['core', 'plugins', 'vue', 'react', 'svelte', 'angular', 'web-component', ''].map((name, index) => ({
    name: `@morfira-dev/wysiwyg${name ? `-${name}` : ''}`, version: `1.${index}.0`,
    ...collectPackageChanges(Array.from({ length: 20 }, (_, number) => ({
      hash: hash(index * 100 + number + 1), message: `fix(${name || 'facade'}): ${'🧩<&'.repeat(90)}`,
    }))),
  }));
  const message = notificationMessage(publishedReport(report(packages)));
  assert.ok(message.text.length <= 3800);
  assert.ok(message.html.length <= 32000);
  for (const entry of packages) {
    assert.ok(message.text.includes(`${entry.name} — ${entry.version}`));
    const label = entry.name === '@morfira-dev/wysiwyg' ? 'facade' : entry.name.slice('@morfira-dev/wysiwyg-'.length);
    assert.ok(message.text.includes(`fix(${label})`), `${entry.name}: every package gets a preview before another takes all the space.`);
  }
  assert.equal(message.text.match(/Ещё изменений:/g)?.length, packages.length);
  assert.equal(message.html.match(/Все изменения<\/a>/g)?.length, packages.length);
  assert.ok(!message.text.includes('\uD83E…'), 'Subject clipping cannot leave a dangling emoji surrogate.');
});

test('release reports reject malformed change metadata while accepting the older version-1 format', () => {
  const entry = { name: '@morfira-dev/wysiwyg', version: '1.0.0' };
  assert.equal(publishedReport(report([entry])).packages[0].changes, undefined);
  const change = { hash: hash(1), label: 'fix(core)', subject: 'Selection' };
  for (const invalid of [
    { changes: [change], changeCount: 0 },
    { changes: [change, change], changeCount: 2 },
    { changes: [{ ...change, hash: 'javascript:alert(1)' }], changeCount: 1 },
    { changes: [{ ...change, subject: 'Injected\nline' }], changeCount: 1 },
    { changes: [{ ...change, label: 'fix\u202E' }], changeCount: 1 },
    { changes: [change] },
  ]) assert.throws(() => publishedReport(report([{ ...entry, ...invalid }])), /notification|changes/i);
});

test('sender rejects a report from another execution before attempting Telegram delivery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'morfira-notification-'));
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: hash(1), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
    TELEGRAM_BOT_TOKEN: 'fixture-never-sent', TELEGRAM_CHAT_ID: 'fixture-never-sent' };
  try {
    await notifyPublishedRelease(directory, env);
    await writeFile(join(directory, 'release-published.json'), JSON.stringify(report([{ name: '@morfira-dev/wysiwyg', version: '1.0.0' }])));
    await assert.rejects(() => notifyPublishedRelease(directory, env), /does not belong to this workflow/);
  }
  finally { await rm(directory, { recursive: true, force: true }); }
});
