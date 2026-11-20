import type { PreviewUIController } from '@morfira-dev/wysiwyg/ui/preview';
import type { SaveStateCommands } from '@morfira-dev/wysiwyg/plugins/save-state';
import type { SaveStateUIController } from '@morfira-dev/wysiwyg/ui/save-state';
import type { Editor } from '@morfira-dev/wysiwyg';
import type { SpecialCharacterUIController } from '@morfira-dev/wysiwyg/ui/special-characters';
import type { FullscreenUIController } from '@morfira-dev/wysiwyg/ui/fullscreen';
import type { PrintUIController } from '@morfira-dev/wysiwyg/ui/print';
import type { OutlineUIController } from '@morfira-dev/wysiwyg/ui/outline';
import type { ContextualLinkUIController } from '@morfira-dev/wysiwyg/ui/contextual-link';
import type { ContextualImageUIController } from '@morfira-dev/wysiwyg/ui/contextual-image';

export interface ReadingProbe {
  editor: Editor;
  print: PrintUIController;
  outline: OutlineUIController;
  links: ContextualLinkUIController;
  image: ContextualImageUIController;
}

export interface OptionalUIProbe {
  editor: Editor;
  preview: PreviewUIController;
  saveState: SaveStateCommands;
  saveUI: SaveStateUIController;
  getSaveCalls: () => number;
  characters: SpecialCharacterUIController;
  fullscreen: FullscreenUIController;
  setupFeatures: () => void;
  setupReading: () => void;
  getReading: () => ReadingProbe;
  dispose: () => void;
}

declare global {
  interface Window {
    morfiraOptionalUI: OptionalUIProbe;
  }
}
