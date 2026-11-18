import type { NotificationText, PackageChanges, PublishedCommit, PublishedPackage, PublishedReleaseReport, ReleaseCommit } from './release-notification.types.js';

const unsafeText = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const commitLabel = /^[a-z][a-z0-9-]{0,24}(?:\([^()\r\n]{1,48}\))?!?$/;
const shortText = (value: string, maximum: number): string => {
  if (value.length <= maximum) return value;
  const prefix = value.slice(0, maximum - 1).replace(/[\uD800-\uDBFF]$/, '');
  return `${prefix}…`;
};
const escapeHTML = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const line = (text: string, html = escapeHTML(text)): NotificationText => ({ text, html });
const joinLines = (lines: readonly NotificationText[]): NotificationText => ({
  text: lines.map((entry) => entry.text).join('\n'),
  html: lines.map((entry) => entry.html).join('\n'),
});
const repository = 'https://github.com/morfira-dev/morfira-wysiwyg';

export const collectPackageChanges = (commits: readonly ReleaseCommit[]): PackageChanges => {
  const seen = new Set<string>();
  const changes: PublishedCommit[] = [];
  let changeCount = 0;
  for (const commit of commits) {
    if (!/^[a-f\d]{40}$/i.test(commit.hash) || seen.has(commit.hash.toLowerCase())) continue;
    const title = (commit.message.split(/\r?\n/, 1)[0] ?? '').slice(0, 2048)
      .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
    if (!title || /^Merge (?:branch|pull request|remote-tracking branch)\b/.test(title)
      || /^chore\(release\): sync package versions(?: \[skip ci\])?$/.test(title)) continue;
    seen.add(commit.hash.toLowerCase());
    changeCount++;
    if (changes.length >= 12) continue;
    const match = /^([a-z][a-z0-9-]{0,24}(?:\([^()\r\n]{1,48}\))?!?):\s+(.+)$/.exec(title);
    const label = match?.[1] ?? 'commit';
    const breaking = /^BREAKING(?: CHANGE|-CHANGE):/m.test(commit.message);
    changes.push({ hash: commit.hash.toLowerCase(), label: breaking && !label.endsWith('!') ? `${label}!` : label, subject: shortText(match?.[2] ?? title, 240) });
  }
  return { changes, changeCount };
};

export const parsePackageChanges = (entry: Record<string, unknown>): Partial<PackageChanges> => {
  if (entry.changes === undefined && entry.changeCount === undefined) return {};
  if (!Array.isArray(entry.changes) || entry.changes.length > 12 || !Number.isSafeInteger(entry.changeCount)
    || (entry.changeCount as number) < entry.changes.length || (entry.changeCount as number) > 1000000)
    throw new TypeError('Invalid package changes in the notification report.');
  const changes: PublishedCommit[] = entry.changes.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid notification commit.');
    const commit = value as Record<string, unknown>;
    if (typeof commit.hash !== 'string' || !/^[a-f\d]{40}$/i.test(commit.hash)
      || typeof commit.label !== 'string' || commit.label.length > 80 || !commitLabel.test(commit.label) || unsafeText.test(commit.label)
      || typeof commit.subject !== 'string' || !commit.subject.trim() || commit.subject.length > 240 || unsafeText.test(commit.subject))
      throw new TypeError('Invalid notification commit.');
    return { hash: commit.hash.toLowerCase(), label: commit.label, subject: commit.subject };
  });
  if (new Set(changes.map((commit) => commit.hash)).size !== changes.length) throw new TypeError('Duplicate notification commit.');
  return { changes, changeCount: entry.changeCount as number };
};

const packageMessage = (entry: PublishedPackage, shown: number): readonly NotificationText[] => {
  const header = `${entry.name} — ${entry.version}`;
  const notes = `${repository}/releases/tag/${encodeURIComponent(`${entry.name}@${entry.version}`)}`;
  const lines = [line(header, `<b>${escapeHTML(header)}</b>`)];
  if (entry.changes === undefined) lines.push(line('Список изменений недоступен.'));
  else if (entry.changeCount === 0) lines.push(line('Обновление внутренних зависимостей.'));
  else {
    for (const commit of entry.changes.slice(0, shown)) {
      const text = `• ${commit.label}: ${shortText(commit.subject, 120)} `;
      const hash = commit.hash.slice(0, 7);
      lines.push(line(`${text}(${hash})`, `${escapeHTML(text)}(<a href="${repository}/commit/${commit.hash}">${hash}</a>)`));
    }
    const omitted = (entry.changeCount ?? entry.changes.length) - shown;
    if (omitted > 0) lines.push(line(`Ещё изменений: ${omitted}.`));
  }
  lines.push(line('Все изменения', `<a href="${notes}">Все изменения</a>`), line(''));
  return lines;
};

export const notificationMessage = (report: PublishedReleaseReport): NotificationText => {
  const entries = [...report.packages].sort((left, right) => left.name.localeCompare(right.name));
  const shown = entries.map(() => 0);
  const render = (): NotificationText => joinLines([
    line('Morfira WYSIWYG — опубликованы пакеты', '<b>Morfira WYSIWYG — опубликованы пакеты</b>'), line(''),
    ...entries.flatMap((entry, index) => packageMessage(entry, shown[index])),
    line('GitHub Actions', `<a href="${repository}/actions/runs/${report.runId}">GitHub Actions</a>`),
  ]);
  const fits = (message: NotificationText): boolean => message.text.length <= 3800 && message.html.length <= 32000;
  let message = render();
  if (!fits(message)) throw new RangeError('Release package headers exceed the bounded notification size.');
  // Each package gets a turn before another receives its next commit.
  for (let round = 0; round < 12; round++) {
    for (const [index, entry] of entries.entries()) {
      if (shown[index] >= (entry.changes?.length ?? 0)) continue;
      shown[index]++;
      const candidate = render();
      if (fits(candidate)) message = candidate;
      else shown[index]--;
    }
  }
  return message;
};
