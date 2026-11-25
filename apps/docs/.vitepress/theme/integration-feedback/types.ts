export type IntegrationScenarioId = 'article' | 'knowledge-base' | 'application-form';
export type FeedbackLanguage = 'ru' | 'en';
export type FeedbackBrowserFamily = 'Chromium family' | 'Firefox' | 'Safari' | 'Unknown';
export type FeedbackValidationField = 'scenario' | 'packageVersion' | 'applicationVersion' | 'steps' | 'expected' | 'actual' | 'browser' | 'language';

export interface IntegrationScenario {
  readonly id: IntegrationScenarioId;
  readonly features: readonly string[];
  readonly title: Readonly<Record<FeedbackLanguage, string>>;
  readonly steps: Readonly<Record<FeedbackLanguage, readonly string[]>>;
  readonly expected: Readonly<Record<FeedbackLanguage, readonly string[]>>;
}

export interface FeedbackReportInput {
  readonly scenario: IntegrationScenarioId;
  readonly packageVersion: string;
  readonly applicationVersion?: string;
  readonly steps: string;
  readonly expected: string;
  readonly actual: string;
  readonly browser?: FeedbackBrowserFamily;
  readonly language: FeedbackLanguage;
}

export type FeedbackReportResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly field: FeedbackValidationField; readonly reason: 'required' | 'bounds' | 'private-input' | 'invalid' };
