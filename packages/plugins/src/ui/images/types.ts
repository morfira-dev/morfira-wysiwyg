import type { imageFormMessages } from './messages.js';

export interface ImageFormValues {
  src: string;
  alt: string;
  width: string;
  height: string;
  caption: string;
}
export interface ImageFormOptions {
  initialValues?: Partial<ImageFormValues>;
  label?: string;
  onError?: (error: unknown) => void;
}
export interface ImageFormController {
  readonly element: HTMLElement;
  refresh(): void;
  getValues(): ImageFormValues;
  setValues(values: Partial<ImageFormValues>): void;
  destroy(): void;
}
export type ImageFormMessageKey = keyof typeof imageFormMessages.en;
export type ImageFormField = keyof ImageFormValues;
