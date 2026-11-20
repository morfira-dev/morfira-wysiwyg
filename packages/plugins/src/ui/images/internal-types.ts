import type { ImageFormController, ImageFormMessageKey, ImageFormValues } from './types.js';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import type { FormSelection } from '../shared/types.js';

export interface ImageSizeLockController {
  isLocked(): boolean;
  inspect(image: HTMLImageElement | undefined, allowRefresh: boolean): void;
  validate(image: HTMLImageElement | undefined, draft: ImageFormValues): void;
  render(blocked: boolean): void;
  reset(): void;
  destroy(): void;
}

export interface ImageUploadRetry {
  file: File;
  range: Range;
  revision: number;
}

export interface ImageUploadUIOptions {
  setStatus(key: ImageFormMessageKey | undefined, error?: boolean): void;
  report(error: unknown, uploading?: boolean): void;
  onChange(): void;
  refresh(): void;
}

export interface ImageUploadUIController {
  readonly element: HTMLElement;
  isUploading(): boolean;
  render(): void;
  cancel(): void;
  destroy(): void;
}

export interface ImageDialogOptions {
  inspect(): void;
  cancel(): void;
  label(): string;
  closeLabel(): string;
}

export interface ImageDialogController {
  open(): void;
  close(restoreFocus?: boolean): void;
  isOpen(): boolean;
  suspend(): void;
  resume(): void;
  render(): void;
  destroy(): void;
}

export interface ImageFormBaseController extends ImageFormController {
  cancelUpload(): void;
  suspendFocus(suspend: () => void): void;
}

export type ImageUploadUIFactory = (
  document: Document, editor: Editor, selection: FormSelection, options: ImageUploadUIOptions,
) => ImageUploadUIController;
