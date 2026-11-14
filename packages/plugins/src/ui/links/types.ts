import type { linkFormMessages } from './messages.js';

export interface LinkFormValues {
  href: string;
  title: string;
  text: string;
  newTab: boolean;
}

export interface LinkFormOptions {
  initialValues?: Partial<LinkFormValues>;
  label?: string;
  onError?: (error: unknown) => void;
}

export interface LinkFormController {
  readonly element: HTMLElement;
  refresh(): void;
  getValues(): LinkFormValues;
  setValues(values: Partial<LinkFormValues>): void;
  destroy(): void;
}

export type LinkFormMessageKey = keyof typeof linkFormMessages.en;
