import { saveState, saveStateCommands } from '@morfira-dev/wysiwyg/plugins/save-state';
import type { SaveStateCommands, SaveStateContext, SaveStateOptions, SaveStateSnapshot } from '@morfira-dev/wysiwyg/plugins/save-state';
import { createSaveStateUI, saveStateUIMessages } from '@morfira-dev/wysiwyg/ui/save-state';
import type { SaveStateUIController, SaveStateUIOptions, SaveStateUIMessageKey } from '@morfira-dev/wysiwyg/ui/save-state';
import type { Editor, EditorDocument } from '@morfira-dev/wysiwyg';

export interface SaveTestRequest {
  document: EditorDocument;
  signal: AbortSignal;
  revision: number;
  resolve: () => void;
  reject: (error: unknown) => void;
}
export interface SaveTestProbe {
  mode: 'pending' | 'resolve' | 'reject' | 'throw' | 'mutate';
  requests: SaveTestRequest[];
  errors: string[];
  reads: number;
}
export interface SaveTestOptions { autoSave?: boolean; debounceMs?: number; mode?: SaveTestProbe['mode'] }

declare global {
  interface Window {
    saveModule: typeof import('@morfira-dev/wysiwyg/plugins/save-state');
    saveUIModule: typeof import('@morfira-dev/wysiwyg/ui/save-state');
    saveAPI: SaveStateCommands;
    saveUI: SaveStateUIController;
    saveProbe: SaveTestProbe;
    savePending: Promise<boolean>;
    saveHook?: () => void;
  }
}

const checkSaveTypes = (host: HTMLElement, editor: Editor, key: SaveStateUIMessageKey) => {
  const options: SaveStateOptions = { save: (document: EditorDocument, context: SaveStateContext) => { void [document, context.signal, context.revision]; }, autoSave: true, debounceMs: 400 };
  saveState(options);
  const api: SaveStateCommands = saveStateCommands(editor);
  const state: SaveStateSnapshot = api.getState();
  const result: Promise<boolean> = api.save();
  const uiOptions: SaveStateUIOptions = { label: saveStateUIMessages.en[key] };
  const ui: SaveStateUIController = createSaveStateUI(host, editor, uiOptions);
  const stop = api.subscribe((next) => { void next.status; });
  stop(); api.markSaved(); ui.refresh(); ui.destroy();
  // @ts-expect-error backend transport is explicitly required
  saveState({ autoSave: true });
  // @ts-expect-error snapshots are readonly
  state.dirty = true;
  // @ts-expect-error UI does not own a network endpoint
  createSaveStateUI(host, editor, { url: '/save' });
  void result;
};
void checkSaveTypes;
