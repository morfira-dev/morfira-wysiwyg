import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Context, TGBotConfig } from '@nuykon/semantic-release-tg-bot';
import type { PublishedPackage, PublishedReleaseReport } from './release-notification.types.js';
import { notificationMessage, parsePackageChanges } from './release-notification-message.js';

const plainRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export const publishedReport = (value: unknown): PublishedReleaseReport => {
  if (!plainRecord(value) || value.version !== 1 || typeof value.sourceSha !== 'string' || !/^[a-f\d]{40}$/i.test(value.sourceSha)
    || typeof value.runId !== 'string' || !/^\d+$/.test(value.runId) || typeof value.runAttempt !== 'string' || !/^\d+$/.test(value.runAttempt)
    || !Array.isArray(value.packages) || value.packages.length > 32)
    throw new TypeError('Invalid live release notification report.');
  const packages: PublishedPackage[] = value.packages.map((entry: unknown) => {
    if (!plainRecord(entry) || typeof entry.name !== 'string' || entry.name.length > 120
      || !/^@morfira-dev\/wysiwyg(?:-[a-z0-9-]+)?$/.test(entry.name) || typeof entry.version !== 'string' || entry.version.length > 64
      || !/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i.test(entry.version))
      throw new TypeError('Invalid published package in the notification report.');
    return { name: entry.name, version: entry.version, ...parsePackageChanges(entry) };
  });
  if (new Set(packages.map((entry) => entry.name)).size !== packages.length) throw new TypeError('Duplicate published package in the notification report.');
  return { version: 1, sourceSha: value.sourceSha, runId: value.runId, runAttempt: value.runAttempt, packages };
};

export const notifyPublishedRelease = async (directory: string, env: NodeJS.ProcessEnv = process.env): Promise<void> => {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REF !== 'refs/heads/main') {
    console.log('Telegram notification skipped outside the main GitHub Actions release.');
    return;
  }
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    console.log('Telegram notification skipped: configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
    return;
  }
  const path = resolve(directory, 'release-published.json');
  let size: number;
  try { size = (await stat(path)).size; }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.log('Telegram notification skipped: no successful live release report.');
      return;
    }
    throw error;
  }
  if (size > 256000) throw new RangeError('Release notification report is too large.');
  const report = publishedReport(JSON.parse(await readFile(path, 'utf8')) as unknown);
  if (report.sourceSha !== env.GITHUB_SHA || report.runId !== env.GITHUB_RUN_ID || report.runAttempt !== env.GITHUB_RUN_ATTEMPT)
    throw new Error('Release notification report does not belong to this workflow execution.');
  if (!report.packages.length) {
    console.log('Telegram notification skipped: no packages were released.');
    return;
  }
  const message = notificationMessage(report);
  const proxy = env.TELEGRAM_BOT_PROXY?.trim();
  const context: Context = {
    env: { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, TELEGRAM_BOT_PROXY: proxy || undefined },
    branch: { name: 'main' },
    logger: { log: () => console.log('Telegram notification delivery is in progress.') },
  };
  const options: TGBotConfig = {
    packageName: 'Morfira WYSIWYG',
    notifyOnSuccess: true,
    notifyOnFail: false,
    notifications: [{ chatIds: 'TELEGRAM_CHAT_ID', branch: 'main' }],
    success: { format: 'html', message: () => message.html },
  };
  const plugin = await import('@nuykon/semantic-release-tg-bot');
  plugin.verifyConditions(options, context);
  await plugin.success(options, context);
  console.log(`Telegram notification delivered for ${report.packages.length} published packages.`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await notifyPublishedRelease(process.cwd()); }
  catch (error) {
    let detail = error instanceof Error ? error.message : 'Unknown Telegram notification failure.';
    for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_BOT_PROXY']) {
      const secret = process.env[key]?.trim();
      if (secret) detail = detail.split(secret).join('[redacted]');
    }
    console.error(`Telegram notification failed after publication: ${detail.replace(/[\r\n\u001b]/g, ' ').slice(0, 500)}`);
    process.exitCode = 1;
  }
}
