import type { Editor, EditorNodePositionHandle } from '@morfira-dev/wysiwyg-core';
import type { StructuralCommands } from '../packages/plugins/src/sdk/structural/types.js';
declare global {
  interface Window {
    structuralProbe: { editor: Editor; commands: StructuralCommands; handles: EditorNodePositionHandle[]; nodes: Record<string, Node> };
  }
}
export {};
