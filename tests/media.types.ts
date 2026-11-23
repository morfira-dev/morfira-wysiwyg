import type { Editor } from '@morfira-dev/wysiwyg';
import type { MediaCommands } from '@morfira-dev/wysiwyg/plugins/media';
import type { MediaFormController, MediaViewController } from '@morfira-dev/wysiwyg/ui/media';
export interface MediaProbe {
  editor: Editor;
  commands: MediaCommands;
  form: MediaFormController;
  view: MediaViewController;
}
declare global {
  interface Window { mediaProbe: MediaProbe; }
}
