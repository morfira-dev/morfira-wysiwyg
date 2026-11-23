import type { EditorDocument, EditorPlugin, Editor } from '@morfira-dev/wysiwyg';
import type { ImageOptions } from '@morfira-dev/wysiwyg/plugins/images';
import type { MentionOptions } from '@morfira-dev/wysiwyg/plugins/mentions';
import type { CodeHighlightProvider } from '@morfira-dev/wysiwyg/ui/code-blocks';

export interface RecipeRecord { readonly id: string; readonly label: string; }
export interface VersionedRecipeDocument { readonly version: string; readonly document: EditorDocument; }
export interface RecipeSaveTransport {
  save(document: EditorDocument, version: string, signal: AbortSignal): Promise<string>;
  load(signal: AbortSignal): Promise<VersionedRecipeDocument>;
}
export interface RecipeSaveSession {
  readonly save: (document: EditorDocument, context: { readonly signal: AbortSignal }) => Promise<void>;
  reload(signal: AbortSignal): Promise<VersionedRecipeDocument>;
  acceptReload(result: VersionedRecipeDocument): void;
  getVersion(): string;
}
export interface RecipeOptions {
  readonly upload: NonNullable<ImageOptions['upload']>;
  readonly mentionProvider: MentionOptions['provide'];
  readonly saveSession: RecipeSaveSession;
  readonly onError?: (error: unknown) => void;
}
export interface RecipeBundle {
  readonly plugins: EditorPlugin[];
  insertRecord(editor: Editor, value: RecipeRecord): boolean;
}
export interface RecipeHighlightModule { readonly highlight: CodeHighlightProvider; }
export type RecipeHighlightLoader = () => Promise<RecipeHighlightModule>;
export interface LocalRecipeServices {
  readonly options: RecipeOptions;
  readonly session: RecipeSaveSession;
  simulateRemoteChange(): void;
  getRemoteVersion(): string;
}
