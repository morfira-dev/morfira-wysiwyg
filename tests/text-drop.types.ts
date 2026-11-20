import type { Editor, EditorPlugin } from '@morfira-dev/wysiwyg';
import type { TextDropCommands, TextDropOptions, TextDropState } from '@morfira-dev/wysiwyg/plugins/text-drop';

export interface TextDropTestProbe {
  module: typeof import('@morfira-dev/wysiwyg/plugins/text-drop');
  api: TextDropCommands;
  factory: EditorPlugin;
  transfer?: DataTransfer;
  errors: string[];
}
export interface TextDropPoint {
  selector: string;
  offset?: number;
  end?: boolean;
}
export interface TextDropTransfer extends TextDropPoint {
  internal?: boolean;
  text?: string;
  html?: string;
  file?: boolean;
  copy?: boolean;
  native?: boolean;
  cancelled?: boolean;
}

declare global {
  interface Window { textDropTest: TextDropTestProbe; }
}

const verifyTextDropTypes = (editor: Editor, create: typeof import('@morfira-dev/wysiwyg/plugins/text-drop').textDrop) => {
  const options: TextDropOptions = { enabled: true, onError: (_error: unknown) => undefined };
  const plugin: EditorPlugin = create(options);
  const state: TextDropState = window.textDropTest.api.getState();
  window.textDropTest.api.setEnabled(!state.enabled);
  // @ts-expect-error enabled is a boolean preference
  create({ enabled: 'auto' });
  // @ts-expect-error arbitrary external HTML/render callbacks are not supported
  create({ render: () => '<iframe></iframe>' });
  // @ts-expect-error drop target positions are not a public command authority
  window.textDropTest.api.drop(editor, { index: 1 });
  return plugin;
};
void verifyTextDropTypes;
