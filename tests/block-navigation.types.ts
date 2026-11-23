import type { BlockNavigationCommands } from '@morfira-dev/wysiwyg/plugins/block-navigation';
export interface BlockNavigationProbe {
  commands: BlockNavigationCommands;
  disposePlugin: () => void;
  neighbour?: HTMLElement;
}
declare global {
  interface Window { blockNavigationProbe: BlockNavigationProbe; }
}
