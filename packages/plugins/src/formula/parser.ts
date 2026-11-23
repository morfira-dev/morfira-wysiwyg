import type { FormulaNode } from './types.js';
import type { FormulaToken } from './internal-types.js';

const symbols: Readonly<Record<string, string>> = Object.freeze({
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
  pi: 'π', rho: 'ρ', sigma: 'σ', phi: 'φ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ',
  Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω',
});
const operators: Readonly<Record<string, string>> = Object.freeze({
  times: '×', cdot: '·', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  infty: '∞', sum: '∑', prod: '∏', int: '∫', partial: '∂', nabla: '∇', approx: '≈', to: '→',
});
const functions = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'lim']);
const tokenize = (source: string): FormulaToken[] => {
  const tokens: FormulaToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === ' ') { index++; continue; }
    if (tokens.length >= 512) throw new RangeError('Formula token limit exceeded.');
    if (char === '\\') {
      index++;
      const begin = index;
      while (index < source.length && /[A-Za-z]/.test(source[index])) index++;
      if (index === begin) {
        if (index >= source.length || !'{}_%'.includes(source[index])) throw new SyntaxError('Unsupported formula escape.');
        tokens.push({ kind: 'operator', text: source[index++] });
      }
      else tokens.push({ kind: 'command', text: source.slice(begin, index) });
    }
    else if (/[A-Za-z\u0370-\u03ff]/.test(char)) {
      const begin = index++;
      while (index < source.length && /[A-Za-z\u0370-\u03ff]/.test(source[index])) index++;
      tokens.push({ kind: 'identifier', text: source.slice(begin, index) });
    }
    else if (/[0-9]/.test(char)) {
      const begin = index++;
      while (index < source.length && /[0-9]/.test(source[index])) index++;
      if (source[index] === '.' && /[0-9]/.test(source[index + 1] ?? '')) {
        index++;
        while (index < source.length && /[0-9]/.test(source[index])) index++;
      }
      tokens.push({ kind: 'number', text: source.slice(begin, index) });
    }
    else if ('{}_^'.includes(char)) {
      const kind = char === '{' ? 'open' : char === '}' ? 'close' : char === '_' ? 'sub' : 'sup';
      tokens.push({ kind, text: char });
      index++;
    }
    else if ('+-=*/(),[]|:;.!<>%'.includes(char)) {
      tokens.push({ kind: 'operator', text: char });
      index++;
    }
    else throw new SyntaxError('Unsupported formula character.');
  }
  return tokens;
};

/** A bounded TeX-like subset, never an HTML/TeX execution or macro engine. */
export const parseFormula = (source: string): FormulaNode => {
  if (typeof source !== 'string' || !source.trim() || source.length > 1024 || /[\u0000-\u001f\u007f\u2028\u2029]/.test(source))
    throw new RangeError('Formula source must be one nonempty line of at most 1024 code units.');
  const tokens = tokenize(source);
  let position = 0;
  let count = 0;
  let literalCount = 0;
  const node = (value: FormulaNode): FormulaNode => {
    if (++count > 512) throw new RangeError('Formula node limit exceeded.');
    if (value.type === 'identifier' || value.type === 'number' || value.type === 'operator') literalCount++;
    return Object.freeze(value);
  };
  const argument = (depth: number): FormulaNode => {
    if (tokens[position]?.kind !== 'open') throw new SyntaxError('Formula command requires a brace argument.');
    position++;
    const before = literalCount;
    const result = row(depth + 1, true);
    if (literalCount === before) throw new SyntaxError('Empty formula argument.');
    return result;
  };
  const atom = (depth: number): FormulaNode => {
    if (depth > 24) throw new RangeError('Formula nesting limit exceeded.');
    const token = tokens[position++];
    if (!token) throw new SyntaxError('Missing formula argument.');
    if (token.kind === 'open') return row(depth + 1, true);
    if (token.kind === 'identifier' || token.kind === 'number' || token.kind === 'operator')
      return node({ type: token.kind, text: token.text });
    if (token.kind !== 'command') throw new SyntaxError('Unexpected formula delimiter.');
    if (token.text === 'frac') return node({ type: 'fraction', numerator: argument(depth), denominator: argument(depth) });
    if (token.text === 'sqrt') return node({ type: 'root', value: argument(depth) });
    if (Object.hasOwn(symbols, token.text)) return node({ type: 'identifier', text: symbols[token.text] });
    if (Object.hasOwn(operators, token.text)) return node({ type: 'operator', text: operators[token.text] });
    if (functions.has(token.text)) return node({ type: 'identifier', text: token.text });
    throw new SyntaxError('Unsupported formula command.');
  };
  const row = (depth: number, grouped: boolean): FormulaNode => {
    if (depth > 24) throw new RangeError('Formula nesting limit exceeded.');
    const children: FormulaNode[] = [];
    while (position < tokens.length && tokens[position].kind !== 'close') {
      let base = atom(depth);
      let sub: FormulaNode | undefined;
      let sup: FormulaNode | undefined;
      while (tokens[position]?.kind === 'sub' || tokens[position]?.kind === 'sup') {
        const kind = tokens[position++].kind;
        if (kind === 'sub' && sub || kind === 'sup' && sup) throw new SyntaxError('Duplicate formula script.');
        const value = atom(depth + 1);
        if (kind === 'sub') sub = value;
        else sup = value;
      }
      if (sub || sup) base = node({ type: 'scripts', base, ...(sub ? { sub } : {}), ...(sup ? { sup } : {}) });
      children.push(base);
    }
    if (grouped) {
      if (tokens[position]?.kind !== 'close') throw new SyntaxError('Unclosed formula group.');
      position++;
    }
    return node({ type: 'row', children: Object.freeze(children) });
  };
  const result = row(0, false);
  if (position !== tokens.length) throw new SyntaxError('Unexpected closing formula group.');
  if (!literalCount) throw new SyntaxError('Empty formula.');
  return result;
};
