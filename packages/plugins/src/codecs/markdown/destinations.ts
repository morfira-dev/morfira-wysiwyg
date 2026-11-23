import { consumeWork } from './budget.js';
import { decodeMarkdownString } from './entities.js';
import type { MarkdownDestination, MarkdownParserContext } from './internal-types.js';

const punctuation = /[!-/:-@[-`{-~]/;

export const referenceLabel = (value: string): string | undefined => {
  if (!value.length || value.length > 999) return;
  const label = decodeMarkdownString(value).trim().replace(/\s+/g, ' ').toLowerCase();
  return label || undefined;
};

export const readMarkdownDestination = (source: string, start: number, context: MarkdownParserContext): MarkdownDestination | undefined => {
  if (source[start] !== '(') return;
  let index = start + 1;
  while (/[ \t]/.test(source[index] ?? '')) index++;
  let begin = index;
  let href: string;
  if (source[index] === '<') {
    begin = ++index;
    for (; index < source.length && source[index] !== '>'; index++) {
      consumeWork(context.budget, 1);
      if (source[index] === '\\' && punctuation.test(source[index + 1] ?? '')) { index++; continue; }
      if (source[index] === '<' || /[\r\n]/.test(source[index])) return;
    }
    if (source[index] !== '>') return;
    href = decodeMarkdownString(source.slice(begin, index++));
  }
  else {
    let nested = 0;
    for (; index < source.length; index++) {
      consumeWork(context.budget, 1);
      const char = source[index];
      if (char === '\\' && punctuation.test(source[index + 1] ?? '')) { index++; continue; }
      if (char === '(') { if (++nested > 16) return; }
      else if (char === ')') { if (!nested) break; nested--; }
      else if (/\s/.test(char) && !nested) break;
    }
    if (nested) return;
    href = decodeMarkdownString(source.slice(begin, index));
  }
  let whitespace = false;
  while (/[ \t]/.test(source[index] ?? '')) { whitespace = true; index++; }
  let title: string | undefined;
  const open = source[index];
  if (whitespace && (open === '"' || open === "'" || open === '(')) {
    const close = open === '(' ? ')' : open;
    begin = ++index;
    for (; index < source.length && source[index] !== close; index++) {
      consumeWork(context.budget, 1);
      if (source[index] === '\\' && punctuation.test(source[index + 1] ?? '')) { index++; continue; }
      if (/[\r\n]/.test(source[index]) || open === '(' && source[index] === '(') return;
    }
    if (source[index] !== close) return;
    title = decodeMarkdownString(source.slice(begin, index++));
    while (/[ \t]/.test(source[index] ?? '')) index++;
  }
  return source[index] === ')' ? { end: index + 1, href, ...(title === undefined ? {} : { title }) } : undefined;
};

export const safeMarkdownDestination = (value: string, image: boolean): string | undefined => {
  if (!value || value.length > 20000 || /[\u0000-\u0020\u007f]/.test(value) || value.startsWith('\\') || value.startsWith('//')) return;
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1].toLowerCase();
  if (protocol && !(image ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel']).includes(protocol)) return;
  return value;
};
