import type { Editor } from '@morfira-dev/wysiwyg';
import type { CodeBlockCommands } from '@morfira-dev/wysiwyg/plugins/code-blocks';
import type { CodeBlockFormController, CodeBlockViewController } from '@morfira-dev/wysiwyg/ui/code-blocks';
export interface CodeBlockProbe {
  editor: Editor;
  commands: CodeBlockCommands;
  form: CodeBlockFormController;
  view: CodeBlockViewController;
  viewHost: HTMLElement;
  uiHost: HTMLElement;
}
declare global { interface Window { codeBlockProbe: CodeBlockProbe; } }
