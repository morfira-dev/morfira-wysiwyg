import type { Editor } from '@morfira-dev/wysiwyg';
import type { LinkFormController } from '@morfira-dev/wysiwyg/ui/links';
import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';
import type { StandardEditorUIController } from '@morfira-dev/wysiwyg/ui/standard';
import type { ContextualImageUIController } from '@morfira-dev/wysiwyg/ui/contextual-image';
import type { ContextualLinkUIController } from '@morfira-dev/wysiwyg/ui/contextual-link';
import type { ContextualToolbarController } from '@morfira-dev/wysiwyg/ui/contextual';
import type { SearchFormController } from '@morfira-dev/wysiwyg/ui/search';
import type { FontCommands } from '@morfira-dev/wysiwyg/plugins/fonts';
import type { ListPropertyCommands } from '@morfira-dev/wysiwyg/plugins/list-properties';
import type { TextDirectionCommands } from '@morfira-dev/wysiwyg/plugins/text-direction';

export interface ConsumerProbe {
  editor?: Editor;
  changes: number;
  ui?: StandardEditorUIController;
  contextual?: ContextualToolbarController;
  contextualLink?: ContextualLinkUIController;
  contextualImage?: ContextualImageUIController;
  showContextualImage?: () => void;
  hideContextualImage?: () => void;
  showContextualLink?: () => void;
  hideContextualLink?: () => void;
  showContextual?: () => void;
  hideContextual?: () => void;
  fonts?: FontCommands;
  listProperties?: ListPropertyCommands;
  textDirection?: TextDirectionCommands;
  showOverflow?: () => void;
  hideOverflow?: () => void;
  insertNote?: (text: string) => boolean;
  forms?: {
    links: LinkFormController;
    images: ImageFormController;
    search: SearchFormController;
  };
}
declare global {
  interface Window {
    morfiraConsumer: ConsumerProbe;
  }
}
