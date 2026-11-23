import type { Editor } from '@morfira-dev/wysiwyg';
import type { NodeCommands, NodeViewsController, DecorationsController } from '@morfira-dev/wysiwyg/sdk';
export interface ExtensionsProbe {
  editor: Editor;
  nodes: NodeCommands;
  view?: NodeViewsController;
  decorations?: DecorationsController;
  created: number;
  updated: number;
  destroyed: number;
}
declare global {
  interface Window {
    sdkExtensions: ExtensionsProbe;
  }
}
