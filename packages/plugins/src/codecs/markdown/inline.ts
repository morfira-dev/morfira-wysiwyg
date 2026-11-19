import type { DocumentNode } from '@morfira-dev/wysiwyg-core';
import { consumeWork, maximumMarkdownDepth } from './budget.js';
import type { MarkdownDestination, MarkdownParserContext } from './internal-types.js';

const punctuation = /[!-/:-@[-`{-~]/;
const unescape = (value: string): string => value.replace(/\\([!-/:-@[-`{-~])/g, '$1');
const closing = (source: string, token: string, from: number, context: MarkdownParserContext): number => {
  let index = from;
  while (index < source.length) {
    const next = source.indexOf(token, index);
    consumeWork(context.budget, (next < 0 ? source.length : next) - index + 1);
    if (next < 0) return -1;
    let slashes = 0;
    for (let before = next - 1; before >= 0 && source[before] === '\\'; before--) slashes++;
    if (slashes % 2 === 0) return next;
    index = next + token.length;
  }
  return -1;
};

const closingCode = (source: string, token: string, from: number, context: MarkdownParserContext): number => {
  let cursor = from;
  while (cursor < source.length) {
    const next = source.indexOf(token, cursor);
    consumeWork(context.budget, (next < 0 ? source.length : next) - cursor + 1);
    if (next < 0) return -1;
    let count = token.length;
    while (source[next + count] === '`') count++;
    consumeWork(context.budget, count);
    if (source[next - 1] !== '`' && count === token.length) return next;
    cursor = next + count;
  }
  return -1;
};

const closingLabel = (source: string, from: number, context: MarkdownParserContext): number => {
  let depth = 1;
  for (let index = from; index < source.length; index++) {
    consumeWork(context.budget, 1);
    const char = source[index];
    if (char === '\\' && punctuation.test(source[index + 1] ?? '')) { index++; continue; }
    if (char === '`') {
      let count = 1;
      while (source[index + count] === '`') count++;
      const end = closingCode(source, '`'.repeat(count), index + count, context);
      if (end >= 0) { index = end + count - 1; continue; }
      index += count - 1;
      continue;
    }
    if (char === '[' && ++depth > maximumMarkdownDepth) throw new RangeError('Markdown labels exceed the nesting limit.');
    if (char === ']' && --depth === 0) return index;
  }
  return -1;
};

const destination = (source: string, start: number, context: MarkdownParserContext): MarkdownDestination | undefined => {
  if (source[start] !== '(') return;
  let index = start + 1;
  while (source[index] === ' ') index++;
  const begin = index;
  let href: string;
  if (source[index] === '<') {
    index++;
    const end = closing(source, '>', index, context);
    if (end < 0) return;
    href = unescape(source.slice(index, end));
    index = end + 1;
  }
  else {
    let nested = 0;
    for (; index < source.length; index++) {
      consumeWork(context.budget, 1);
      const char = source[index];
      if (char === '\\' && punctuation.test(source[index + 1] ?? '')) { index++; continue; }
      if (char === '(') {
        if (++nested > 16) return;
      }
      else if (char === ')') {
        if (!nested) break;
        nested--;
      }
      else if (/\s/.test(char) && !nested) break;
    }
    href = unescape(source.slice(begin, index));
  }
  while (source[index] === ' ') index++;
  let title: string | undefined;
  if (source[index] === '"') {
    const end = closing(source, '"', index + 1, context);
    if (end < 0) return;
    title = unescape(source.slice(index + 1, end));
    index = end + 1;
    while (source[index] === ' ') index++;
  }
  return source[index] === ')' ? { end: index + 1, href, ...(title === undefined ? {} : { title }) } : undefined;
};

const safeDestination = (value: string, image: boolean): string | undefined => {
  if (!value || value.length > 20000 || /[\u0000-\u0020\u007f]/.test(value) || value.startsWith('\\') || value.startsWith('//')) return;
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1].toLowerCase();
  if (protocol && !(image ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel']).includes(protocol)) return;
  return value;
};

export const parseMarkdownInline = (source: string, context: MarkdownParserContext, depth: number, allowLinks = true): DocumentNode[] => {
  if (depth > maximumMarkdownDepth) throw new RangeError('Markdown exceeds structural limits.');
  const nodes: DocumentNode[] = [];
  let plain = '';
  const flush = (): void => {
    if (plain) nodes.push(context.text(plain, depth));
    plain = '';
  };
  for (let index = 0; index < source.length;) {
    consumeWork(context.budget, 1);
    const char = source[index];
    if (char === '\\' && punctuation.test(source[index + 1] ?? '')) {
      plain += source[index + 1];
      index += 2;
      continue;
    }
    if (char === '\n') {
      flush();
      nodes.push(context.element('br', [], depth));
      index++;
      continue;
    }
    if (char === '`') {
      let count = 1;
      while (source[index + count] === '`') count++;
      const token = '`'.repeat(count);
      const end = closingCode(source, token, index + count, context);
      if (end >= 0) {
        flush();
        const body = source.slice(index + count, end);
        const text = body.startsWith(' ') && body.endsWith(' ') && /[^ ]/.test(body) ? body.slice(1, -1) : body;
        nodes.push(context.element('code', [context.text(text, depth + 1)], depth));
        index = end + count;
        continue;
      }
      plain += token;
      index += count;
      continue;
    }
    const image = char === '!' && source[index + 1] === '[';
    if (image || (allowLinks && char === '[')) {
      const begin = index + (image ? 2 : 1);
      const labelEnd = closingLabel(source, begin, context);
      const link = labelEnd >= 0 ? destination(source, labelEnd + 1, context) : undefined;
      if (link) {
        flush();
        const label = source.slice(begin, labelEnd);
        const href = safeDestination(link.href, image);
        const title: Record<string, string> = link.title !== undefined && link.title.length <= 20000 ? { title: link.title } : {};
        if (image) {
          const alt = unescape(label);
          if (href && alt.length <= 20000) nodes.push(context.element('img', [], depth, { src: href, alt, ...title }));
          else if (alt) nodes.push(context.text(alt, depth));
        }
        else {
          const children = parseMarkdownInline(label, context, depth + (href ? 1 : 0), false);
          if (href) nodes.push(context.element('a', children, depth, { href, ...title }));
          else nodes.push(...children);
        }
        index = link.end;
        continue;
      }
    }
    const token = source.startsWith('**', index) ? '**' : source.startsWith('__', index) ? '__'
      : source.startsWith('~~', index) ? '~~' : char === '*' || char === '_' ? char : undefined;
    if (token) {
      const end = closing(source, token, index + token.length, context);
      if (end > index + token.length) {
        flush();
        const tag = token === '~~' ? 's' : token.length === 2 ? 'strong' : 'em';
        nodes.push(context.element(tag, parseMarkdownInline(source.slice(index + token.length, end), context, depth + 1, allowLinks), depth));
        index = end + token.length;
        continue;
      }
    }
    plain += char;
    index++;
  }
  flush();
  return nodes;
};
