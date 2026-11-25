import type { EditorDocument } from '@morfira-dev/wysiwyg';
import type { ImageOptions } from '@morfira-dev/wysiwyg/plugins/images';
import type { SaveStateOptions } from '@morfira-dev/wysiwyg/plugins/save-state';

export interface EditorFieldSemanticsOptions {
  readonly labelId: string;
  readonly descriptionId: string;
  readonly errorId: string;
}

export interface EditorFieldSemantics {
  setInvalid(invalid: boolean): void;
  destroy(): void;
}

export interface LocalEditorFieldServices {
  readonly save: SaveStateOptions['save'];
  readonly upload: NonNullable<ImageOptions['upload']>;
  getSaved(): EditorDocument;
  failNextSave(): void;
  destroy(): void;
}
