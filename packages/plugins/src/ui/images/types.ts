import type { imageFormMessages } from './messages.js';

export interface ImageFormValues {
  src: string;
  alt: string;
  width: string;
  height: string;
  caption: string;
}
export type ImageFormMode = 'all' | 'edit';
export type ImageFormPresentation = 'inline' | 'dialog';
export interface ImageFormOptions {
  mode?: ImageFormMode;
  presentation?: ImageFormPresentation;
  keepAspectRatio?: boolean;
  initialValues?: Partial<ImageFormValues>;
  label?: string;
  onError?: (error: unknown) => void;
}
export interface ImageFormController {
  readonly element: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  refresh(): void;
  getValues(): ImageFormValues;
  setValues(values: Partial<ImageFormValues>): void;
  destroy(): void;
}
export type ImageFormMessageKey = keyof typeof imageFormMessages.en;
export type ImageFormField = keyof ImageFormValues;
