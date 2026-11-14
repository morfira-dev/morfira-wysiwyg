import type { EditorDocument } from '../document/index.js';
import type { SelectionBookmark, TextSelection } from '../selection/index.js';
import type { EditorEvents } from '../events/types.js';
export interface EditorChange {
  html: string;
  text: string;
  source: 'user' | 'api';
}
export interface EditorPlugin {
  name: string;
  setup(editor: Editor): void | (() => void);
}
export interface EditorOptions {
  value?: string;
  placeholder?: string;
  readOnly?: boolean;
  label?: string;
  plugins?: EditorPlugin[];
  onChange?: (change: EditorChange) => void;
  historyLimit?: number;
}
export interface Editor {
  readonly element: HTMLElement;
  readonly surface: HTMLElement;
  readonly events: EditorEvents;
  getHTML(): string;
  getText(): string;
  getJSON(): EditorDocument;
  setHTML(html: string): void;
  setJSON(value: EditorDocument): void;
  getSelection(): TextSelection | undefined;
  setSelection(index: number, length?: number): void;
  getFormats(): Record<string, unknown>;
  setReadOnly(value: boolean): void;
  isReadOnly(): boolean;
  format(name: string, value: unknown): void;
  insertHTML(html: string): void;
  focus(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Execute one undoable plugin edit. Read-only and active composition block it. */
  transact(mutate: (surface: HTMLElement) => void): void;
  providePlugin<T>(name: string, api: T): () => void;
  getPlugin<T>(name: string): T | undefined;
  subscribe(listener: (change: EditorChange) => void): () => void;
  onSelectionChange(listener: () => void): () => void;
  destroy(): void;
}
export interface Snapshot {
  html: string;
  selection: SelectionBookmark | undefined;
  typing?: {
    offset: number;
    formats: Record<string, string | boolean>;
  };
}
