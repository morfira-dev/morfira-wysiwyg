import type { Editor } from '@morfira-dev/wysiwyg';
import type { LinkFormController } from '@morfira-dev/wysiwyg/ui/links';
import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';
import type { StandardEditorUIController } from '@morfira-dev/wysiwyg/ui/standard';
import type { SearchFormController } from '@morfira-dev/wysiwyg/ui/search';

export interface ConsumerProbe {
  editor?: Editor;
  changes: number;
  ui?: StandardEditorUIController;
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
