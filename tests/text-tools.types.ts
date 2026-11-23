import type { TextLayoutCommands } from '@morfira-dev/wysiwyg/plugins/text-layout';
import type { FormatPainterCommands } from '@morfira-dev/wysiwyg/plugins/format-painter';
import type { TextLayoutUIController } from '@morfira-dev/wysiwyg/ui/text-layout';
import type { FormatPainterUIController } from '@morfira-dev/wysiwyg/ui/format-painter';

declare global {
  interface Window {
    textLayoutAPI: TextLayoutCommands;
    formatPainterAPI: FormatPainterCommands;
    textLayoutUI: TextLayoutUIController;
    formatPainterUI: FormatPainterUIController;
  }
}
