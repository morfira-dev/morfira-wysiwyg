import { localize } from '@morfira-dev/wysiwyg-core';
import type { Editor } from '@morfira-dev/wysiwyg-core';
import { createNodeViews } from '../../sdk/index.js';
import { formulaNodeName, renderFormula } from '../../formula/index.js';
import { formulaMessages } from './messages.js';
import type { FormulaViewController, FormulaViewOptions } from './types.js';

/** Formula rendering owns an external host; persisted nodes remain literal source. */
export const createFormulaView = (host: HTMLElement, editor: Editor, options: FormulaViewOptions = {}): FormulaViewController => {
  if (options.display !== undefined && !['inline', 'block'].includes(options.display)) throw new TypeError('Invalid formula display.');
  const display = options.display ?? 'block';
  return createNodeViews(host, editor, { name: formulaNodeName, create: (context) => {
    const element = host.ownerDocument.createElement('section');
    element.className = 'mw-formula-view';
    const update = (value: typeof context) => {
      try {
        const math = renderFormula(host.ownerDocument, value.text, { display });
        element.replaceChildren(math);
        element.removeAttribute('data-formula-invalid');
      }
      catch {
        const code = host.ownerDocument.createElement('code');
        code.textContent = value.text;
        const error = host.ownerDocument.createElement('p');
        error.textContent = localize(editor.getLocale(), 'ui.formula.invalid', formulaMessages);
        element.replaceChildren(code, error);
        element.dataset.formulaInvalid = '';
      }
    };
    update(context);
    return { element, update };
  } });
};
