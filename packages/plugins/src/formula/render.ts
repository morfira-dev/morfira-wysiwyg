import { parseFormula } from './parser.js';
import type { FormulaNode, FormulaRenderOptions } from './types.js';

const namespace = 'http://www.w3.org/1998/Math/MathML';

/** Build a fixed MathML vocabulary in an explicitly supplied active document. */
export const renderFormula = (document: Document, source: string, options: FormulaRenderOptions = {}): MathMLElement => {
  if (options.display !== undefined && options.display !== 'inline' && options.display !== 'block')
    throw new TypeError('Formula display must be inline or block.');
  const ast = parseFormula(source);
  const create = (tag: string, children: readonly Element[] = [], text?: string): MathMLElement => {
    const element = document.createElementNS(namespace, tag) as MathMLElement;
    if (text !== undefined) element.textContent = text;
    element.append(...children);
    return element;
  };
  const render = (node: FormulaNode): MathMLElement => {
    if (node.type === 'row') return create('mrow', node.children.map(render));
    if (node.type === 'identifier' || node.type === 'number' || node.type === 'operator')
      return create(node.type === 'identifier' ? 'mi' : node.type === 'number' ? 'mn' : 'mo', [], node.text);
    if (node.type === 'fraction') return create('mfrac', [render(node.numerator), render(node.denominator)]);
    if (node.type === 'root') return create('msqrt', [render(node.value)]);
    if (node.type !== 'scripts') throw new TypeError('Unsupported formula AST node.');
    const children = [render(node.base), ...(node.sub ? [render(node.sub)] : []), ...(node.sup ? [render(node.sup)] : [])];
    return create(node.sub && node.sup ? 'msubsup' : node.sub ? 'msub' : 'msup', children);
  };
  const math = create('math', [render(ast)]);
  math.setAttribute('display', options.display ?? 'inline');
  math.setAttribute('aria-label', source);
  return math;
};
