import type { Editor } from '@morfira-dev/wysiwyg';
import type { SpecialCharacterUIController } from '@morfira-dev/wysiwyg/ui/special-characters';
import type { FullscreenUIController } from '@morfira-dev/wysiwyg/ui/fullscreen';

export interface OptionalUIProbe {
  editor: Editor;
  characters: SpecialCharacterUIController;
  fullscreen: FullscreenUIController;
  dispose: () => void;
}

declare global {
  interface Window {
    morfiraOptionalUI: OptionalUIProbe;
  }
}
