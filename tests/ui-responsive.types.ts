import type { Editor } from '@morfira-dev/wysiwyg';
import type { FormulaFormController } from '@morfira-dev/wysiwyg/ui/formula';
import type { MediaFormController } from '@morfira-dev/wysiwyg/ui/media';
import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';
import type { ContextualLinkUIController } from '@morfira-dev/wysiwyg/ui/contextual-link';

export interface ResponsiveUIProbe {
  editor: Editor;
  formula: FormulaFormController;
  media: MediaFormController;
  image: ImageFormController;
  contextual: ContextualLinkUIController;
}
declare global {
  interface Window {
    responsiveUI: ResponsiveUIProbe;
  }
}
