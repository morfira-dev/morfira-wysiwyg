import type { Editor } from '@morfira-dev/wysiwyg';
import type { LinkFormController } from '@morfira-dev/wysiwyg/ui/links';
import type { ImageFormController } from '@morfira-dev/wysiwyg/ui/images';
import type { SearchFormController } from '@morfira-dev/wysiwyg/ui/search';

export interface ConsumerProbe {
  editor?: Editor;
  changes: number;
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
