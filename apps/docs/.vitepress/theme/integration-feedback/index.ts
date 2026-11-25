import { integrationScenarios } from './scenarios.js';
import type { FeedbackBrowserFamily, FeedbackReportInput, FeedbackReportResult, FeedbackValidationField } from './types.js';

export { integrationScenarios } from './scenarios.js';
export type { FeedbackReportInput, FeedbackReportResult, IntegrationScenarioId } from './types.js';

const semver = /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const versionToken = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const privateInput = /(?:\b(?:https?|ftp|file|data|javascript):|\bwww\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:token|password|secret|api[_ -]?key|authorization)\s*[:=]\s*\S|\bbearer\s+[A-Z0-9._~-]{8,}|\b(?:gh[pousr]_|sk-)[A-Z0-9_-]{16,}|\beyJ[A-Z0-9_-]{8,}\.[A-Z0-9_-]+\.[A-Z0-9_-]+)/i;

/** Called only by explicit UI intent; the caller decides whether to read an agent. */
export const feedbackBrowserFamily = (userAgent: string): FeedbackBrowserFamily => {
  const source = userAgent.slice(0, 1024);
  if (/Edg(?:e|A|iOS)?\/|Chrom(?:e|ium)\/|CriOS\//i.test(source)) return 'Chromium family';
  if (/Firefox\/|FxiOS\//i.test(source)) return 'Firefox';
  if (/Safari\//i.test(source)) return 'Safari';
  return 'Unknown';
};

/** No document/editor, DOM, storage, network or clipboard access. */
export const createIntegrationReport = (input: FeedbackReportInput): FeedbackReportResult => {
  const refusal = (field: FeedbackValidationField, reason: 'required' | 'bounds' | 'private-input' | 'invalid'): FeedbackReportResult => ({ ok: false, field, reason });
  if (!input || typeof input !== 'object') return refusal('scenario', 'invalid');
  const scenario = integrationScenarios.find((entry) => entry.id === input.scenario);
  if (!scenario) return refusal('scenario', 'invalid');
  if (input.language !== 'ru' && input.language !== 'en') return refusal('language', 'invalid');
  if (typeof input.packageVersion !== 'string' || input.packageVersion.length > 100) return refusal('packageVersion', 'invalid');
  const parsedVersion = semver.exec(input.packageVersion);
  if (!parsedVersion || parsedVersion[4]?.split('.').some((part) => /^0\d+$/.test(part))) return refusal('packageVersion', 'invalid');
  if (input.applicationVersion !== undefined && (typeof input.applicationVersion !== 'string'
    || input.applicationVersion.length > 64 || input.applicationVersion && !versionToken.test(input.applicationVersion))) return refusal('applicationVersion', 'invalid');
  if (input.applicationVersion && privateInput.test(input.applicationVersion)) return refusal('applicationVersion', 'private-input');
  if (input.browser !== undefined && !['Chromium family', 'Firefox', 'Safari', 'Unknown'].includes(input.browser)) return refusal('browser', 'invalid');
  const normalized: Record<'steps' | 'expected' | 'actual', string> = { steps: '', expected: '', actual: '' };
  for (const field of ['steps', 'expected', 'actual'] as const) {
    const value = input[field];
    if (typeof value !== 'string' || !value.trim()) return refusal(field, 'required');
    if (value.length > (field === 'steps' ? 4000 : 2000)) return refusal(field, 'bounds');
    const text = value.replace(/\r\n?/g, '\n').trim();
    if (controls.test(text)) return refusal(field, 'invalid');
    if (privateInput.test(text)) return refusal(field, 'private-input');
    normalized[field] = text;
  }
  const ru = input.language === 'ru';
  const lines = [
    ru ? 'Отчёт об интеграции Morfira' : 'Morfira integration report',
    `${ru ? 'Сценарий' : 'Scenario'}: ${scenario.title[input.language]}`,
    `${ru ? 'Возможности сценария' : 'Scenario features'}: ${scenario.features.join(', ')}`,
    `@morfira-dev/wysiwyg: ${input.packageVersion}`,
    `${ru ? 'Версия приложения' : 'Application version'}: ${input.applicationVersion || (ru ? 'не указана' : 'not provided')}`,
  ];
  if (input.browser) lines.push(`${ru ? 'Семейство браузера' : 'Browser family'}: ${input.browser}`);
  lines.push('', ru ? 'Шаги воспроизведения:' : 'Reproduction steps:', normalized.steps,
    '', ru ? 'Ожидаемое поведение:' : 'Expected behavior:', normalized.expected,
    '', ru ? 'Фактическое поведение:' : 'Actual behavior:', normalized.actual,
    '', ru ? 'Пример локальный; содержимое редактора и файлы автоматически не приложены.' : 'Local example; editor content and files are not attached automatically.');
  return { ok: true, text: lines.join('\n') };
};
