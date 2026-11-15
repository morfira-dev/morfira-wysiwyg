import type { EditorUIOptions } from '../editor/types.js';
import type { LinkFormOptions } from '../links/types.js';
import type { ImageFormOptions } from '../images/types.js';
import type { SearchFormOptions } from '../search/types.js';
import type { standardEditorUIMessages } from './messages.js';

export interface StandardEditorUIOptions {
  density?: EditorUIOptions['density'];
  overflow?: EditorUIOptions['overflow'];
  label?: string;
  onError?: (error: unknown) => void;
  links?: LinkFormOptions;
  images?: ImageFormOptions;
  search?: SearchFormOptions;
  table?: { rows?: number; columns?: number };
}

export interface StandardEditorUIController {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export type StandardEditorUIMessageKey = keyof typeof standardEditorUIMessages.en;
