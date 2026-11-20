import type { Editor } from '@morfira-dev/wysiwyg';
import type { QuoteInputDirection } from './types.js';

export const quoteInputSample = () => '<p title="Quote input root start">Alpha <strong>one</strong></p><blockquote title="Quote input first" style="text-align: right"><p>Keep quoted prefix</p><h2 title="Quote input start">Beta <strong>one</strong></h2><p>Selected quote tail</p></blockquote><p>Selected middle</p><blockquote title="Quote input last" style="text-align: center"><p>Selected quote prefix</p><h3 title="Quote input end"><em>Gamma</em> tail</h3><p>Keep quoted suffix</p></blockquote><p title="Quote input root end"><em>Delta</em> tail</p><p>Keep outside</p>';

export const selectQuoteInputSample = (editor: Editor, direction: QuoteInputDirection) => {
  const start = editor.surface.querySelector(direction === 'into'
    ? '[title="Quote input root start"]'
    : '[title="Quote input start"]')?.firstChild;
  const end = editor.surface.querySelector(direction === 'out'
    ? '[title="Quote input root end"] > em'
    : '[title="Quote input end"] > em')?.firstChild;
  if (start?.nodeType !== 3 || end?.nodeType !== 3) return false;
  editor.surface.ownerDocument.getSelection()?.setBaseAndExtent(end, 2, start, 2);
  return true;
};
