import type { Editor } from '@morfira-dev/wysiwyg';
import type { LinkFormController } from '@morfira-dev/wysiwyg/ui/links';
import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';
import type { ImageCommands } from '@morfira-dev/wysiwyg/plugins/images';
import type { StandardEditorUIController } from '@morfira-dev/wysiwyg/ui/standard';
import type { TableCommands, TableSelectionState } from '@morfira-dev/wysiwyg/plugins/tables';
import type { ContextualTableUIController } from '@morfira-dev/wysiwyg/ui/contextual-table';
import type { ContextualImageUIController } from '@morfira-dev/wysiwyg/ui/contextual-image';
import type { ImageResizeUIController } from '@morfira-dev/wysiwyg/ui/image-resize';
import type { ContextualLinkUIController } from '@morfira-dev/wysiwyg/ui/contextual-link';
import type { ContextualToolbarController } from '@morfira-dev/wysiwyg/ui/contextual';
import type { SearchFormController } from '@morfira-dev/wysiwyg/ui/search';
import type { FontCommands } from '@morfira-dev/wysiwyg/plugins/fonts';
import type { ListPropertyCommands } from '@morfira-dev/wysiwyg/plugins/list-properties';
import type { TextDirectionCommands } from '@morfira-dev/wysiwyg/plugins/text-direction';

import type { TablePropertiesCommands } from '@morfira-dev/wysiwyg/plugins/table-properties';
import type { TablePropertiesFormController } from '@morfira-dev/wysiwyg/ui/table-properties';

export interface ConsumerProbe {
  tableProperties?: TablePropertiesCommands;
  tablePropertiesForm?: TablePropertiesFormController;
  editor?: Editor;
  images?: ImageCommands;
  changes: number;
  ui?: StandardEditorUIController;
  contextual?: ContextualToolbarController;
  contextualLink?: ContextualLinkUIController;
  contextualImage?: ContextualImageUIController;
  imageResize?: ImageResizeUIController;
  tables?: TableCommands;
  getTableSelection?: () => TableSelectionState | undefined;
  contextualTable?: ContextualTableUIController;
  showContextualTable?: () => void;
  hideContextualTable?: () => void;
  showContextualImage?: () => void;
  hideContextualImage?: () => void;
  showImageResize?: () => void;
  hideImageResize?: () => void;
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
