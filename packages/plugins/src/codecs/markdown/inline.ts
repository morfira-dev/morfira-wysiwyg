import type { DocumentNode } from '@morfira-dev/wysiwyg-core';
import { consumeWork, maximumMarkdownDepth } from './budget.js';
import type { MarkdownParserContext } from './internal-types.js';
import { readMarkdownDestination, safeMarkdownDestination, referenceLabel } from './destinations.js';
import { decodeMarkdownEntities, decodeMarkdownString } from './entities.js';

const punctuation = /[!-/:-@[-`{-~]/;
const closing = (source: string, token: string, from: number, context: MarkdownParserContext): number => {
  let index = from;
  while (index < source.length) {
    let next = source.indexOf(token, index);
    consumeWork(context.budget, (next < 0 ? source.length : next) - index + 1);
    if (next < 0) return -1;
    let slashes = 0;
    for (let before = next - 1; before >= 0 && source[before] === '\\'; before--) slashes++;
    if (slashes % 2 === 0) {
      if (token[0] === '*' || token[0] === '_') {
        let run = token.length;
        while (source[next + run] === token[0]) run++;
        consumeWork(context.budget, run);
        next += run - token.length;
      }
      return next;
    }
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

const whitespace = (value: string | undefined): boolean => value === undefined || /\s/u.test(value);
const markPunctuation = (value: string | undefined): boolean => value !== undefined && /[\p{P}\p{S}]/u.test(value);
const delimiterOpens = (source: string, index: number, token: string): boolean => {
  const before = source[index - 1];
  const after = source[index + token.length];
  const left = !whitespace(after) && (!markPunctuation(after) || whitespace(before) || markPunctuation(before));
  const right = !whitespace(before) && (!markPunctuation(before) || whitespace(after) || markPunctuation(after));
  return left && (token[0] !== '_' || !right || markPunctuation(before));
};
const delimiterCloses = (source: string, index: number, token: string): boolean => {
  const before = source[index - 1];
  const after = source[index + token.length];
  const left = !whitespace(after) && (!markPunctuation(after) || whitespace(before) || markPunctuation(before));
  const right = !whitespace(before) && (!markPunctuation(before) || whitespace(after) || markPunctuation(after));
  return right && (token[0] !== '_' || !left || markPunctuation(after));
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
      let link = labelEnd >= 0 ? readMarkdownDestination(source, labelEnd + 1, context) : undefined;
      if (!link && labelEnd >= 0) {
        const explicit = source[labelEnd + 1] === '[';
        const referenceEnd = explicit ? closingLabel(source, labelEnd + 2, context) : labelEnd;
        if (referenceEnd >= 0) {
          const label = explicit ? source.slice(labelEnd + 2, referenceEnd) : '';
          const key = referenceLabel(label || source.slice(begin, labelEnd));
          const reference = key ? context.references.get(key) : undefined;
          if (reference) link = { ...reference, end: explicit ? referenceEnd + 1 : labelEnd + 1 };
        }
      }
      if (link) {
        flush();
        const label = source.slice(begin, labelEnd);
        const href = safeMarkdownDestination(link.href, image);
        const title: Record<string, string> = link.title !== undefined && link.title.length <= 20000 ? { title: link.title } : {};
        if (image) {
          const alt = decodeMarkdownString(label);
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
    if (allowLinks && char === '<') {
      const end = source.indexOf('>', index + 1);
      consumeWork(context.budget, (end < 0 ? source.length : end) - index);
      if (end >= 0) {
        const label = source.slice(index + 1, end);
        const email = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/i.test(label);
        const href = /^(?:https?:\/\/|mailto:|tel:)/i.test(label) ? label : email ? `mailto:${label}` : undefined;
        if (href && safeMarkdownDestination(href, false)) {
          flush();
          nodes.push(context.element('a', [context.text(label, depth + 1)], depth, { href }));
          index = end + 1;
          continue;
        }
      }
    }
    if (char === '&') {
      const entity = /^&(?:#(?:x[\da-f]{1,6}|\d{1,8})|[a-z][\da-z]{1,31});/i.exec(source.slice(index, index + 35));
      if (entity) {
        plain += decodeMarkdownEntities(entity[0]);
        index += entity[0].length;
        continue;
      }
    }
    const token = source.startsWith('***', index) ? '***' : source.startsWith('___', index) ? '___'
      : source.startsWith('**', index) ? '**' : source.startsWith('__', index) ? '__'
      : source.startsWith('~~', index) ? '~~' : char === '*' || char === '_' ? char : undefined;
    if (token && delimiterOpens(source, index, token)) {
      let end = closing(source, token, index + token.length, context);
      while (end >= 0 && !delimiterCloses(source, end, token)) end = closing(source, token, end + token.length, context);
      if (end > index + token.length) {
        flush();
        const body = parseMarkdownInline(source.slice(index + token.length, end), context, depth + (token.length === 3 ? 2 : 1), allowLinks);
        const tag = token === '~~' ? 's' : token.length >= 2 ? 'strong' : 'em';
        nodes.push(context.element(tag, token.length === 3 ? [context.element('em', body, depth + 1)] : body, depth));
        index = end + token.length;
        continue;
      }
    }
    plain += char;
    index++;
  }
  flush();
  // Unsafe destinations become ordinary label/alt text. Coalesce those text
  // fragments with their neighbours so canonical export/reimport preserves the
  // document structure as well as its visible text.
  const normalized: DocumentNode[] = [];
  for (const node of nodes) {
    const previous = normalized.at(-1);
    if (node.type === 'text' && previous?.type === 'text') previous.text += node.text;
    else normalized.push(node);
  }
  return normalized;
};
