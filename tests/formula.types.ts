import type { Editor } from '@morfira-dev/wysiwyg';
import type { FormulaCommands } from '@morfira-dev/wysiwyg/plugins/formula';
import type { FormulaFormController, FormulaViewController } from '@morfira-dev/wysiwyg/ui/formula';

export interface FormulaProbe {
  editor: Editor;
  commands: FormulaCommands;
  form: FormulaFormController;
  view: FormulaViewController;
  host: HTMLElement;
  viewHost: HTMLElement;
}

declare global {
  interface Window {
    formulaProbe: FormulaProbe;
  }
}
