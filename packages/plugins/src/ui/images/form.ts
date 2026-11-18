import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createImageFormBase } from './form-base.js';
import { createImageUploadUI } from './upload.js';
import type { ImageFormController, ImageFormOptions } from './types.js';

export const createImageForm = (host: HTMLElement, editor: Editor, options: ImageFormOptions = {}): ImageFormController =>
  createImageFormBase(host, editor, options, createImageUploadUI);
