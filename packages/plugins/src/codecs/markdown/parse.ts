import type { DocumentNode, DocumentTag, EditorDocument } from '@morfira-dev/wysiwyg-core';
import { checklistAttribute } from '../../checklists/schema.js';
import { assertMarkdownLength, consumeNode, consumeWork, createMarkdownBudget, maximumMarkdownDepth } from './budget.js';
import { parseMarkdownInline } from './inline.js';
import type { MarkdownListMarker, MarkdownParserContext } from './internal-types.js';
import type { MarkdownCodecOptions } from './types.js';
import { markdownOptions, markdownSchema } from './options.js';
import { readMarkdownReference } from './references.js';

const listMarker = (line: string): MarkdownListMarker | undefined => {
  const match = /^(?:([-+*])|([0-9]{1,9})[.)])(?:[ \t]+(.*)|$)/.exec(line);
  if (!match) return;
  return { kind: match[1] ? 'ul' : 'ol', number: match[2] ? Number(match[2]) : 1, content: match[3] ?? '' };
};
const thematic = (line: string): boolean => /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line);
const fence = (line: string): RegExpExecArray | null => {
  const match = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
  // A backtick fence's info string cannot contain backticks. Otherwise a
  // paragraph consisting of an inline code span is mistaken for a code block.
  return match && !(match[1][0] === '`' && match[2].includes('`')) ? match : null;
};
const heading = (line: string): RegExpExecArray | null => /^ {0,3}(#{1,6})[ \t]+(.*)$/.exec(line);
const quote = (line: string): boolean => /^ {0,3}>/.test(line);
const setext = (line: string): number | undefined => /^ {0,3}=+[ \t]*$/.test(line) ? 1 : /^ {0,3}-+[ \t]*$/.test(line) ? 2 : undefined;
const indentedCode = (line: string): boolean => /^(?: {4}|\t)/.test(line);
const deferredInline = (source: string, context: MarkdownParserContext, depth: number): DocumentNode[] => {
  const target: DocumentNode[] = [];
  context.inlineTasks.push({ source, depth, target });
  return target;
};

/** Split pipes only outside code spans, respecting escaped literal pipes. */
const tableCells = (line: string): string[] => {
  const cells: string[] = [];
  let value = '';
  let ticks = 0;
  let leading = true;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '\\' && index + 1 < line.length) { value += char + line[++index]; leading = false; continue; }
    if (char === '`') {
      let count = 1;
      while (line[index + count] === '`') count++;
      if (!ticks) ticks = count;
      else if (ticks === count) ticks = 0;
      value += '`'.repeat(count);
      index += count - 1;
      leading = false;
      continue;
    }
    if (char === '|' && !ticks) {
      if (!leading || value.trim()) cells.push(value.trim());
      value = '';
      leading = false;
    }
    else { value += char; if (!/\s/.test(char)) leading = false; }
  }
  if (value.trim() || !line.trimEnd().endsWith('|')) cells.push(value.trim());
  return cells;
};
const tableHeader = (line: string, next: string | undefined): boolean => {
  if (next === undefined || !line.includes('|') || !next.includes('|')) return false;
  const head = tableCells(line);
  const delimiters = tableCells(next);
  return head.length > 0 && head.length <= 100 && delimiters.length === head.length
    && delimiters.every((value) => /^:?-{3,}:?$/.test(value));
};
const blockStart = (lines: string[], index: number): boolean => Boolean(heading(lines[index]) || fence(lines[index]) || thematic(lines[index])
  || quote(lines[index]) || listMarker(lines[index]) || tableHeader(lines[index], lines[index + 1]));

const paragraphText = (lines: string[], terminated: boolean): string => lines.map((line, index) => {
  const last = index === lines.length - 1;
  if (last && !terminated) return line;
  if (/ {2,}$/.test(line)) return line.replace(/ +$/, '') + '\n';
  let backslashes = 0;
  for (let cursor = line.length - 1; cursor >= 0 && line[cursor] === '\\'; cursor--) backslashes++;
  return backslashes % 2 ? line.slice(0, -1) + '\n' : last ? line : line.trimEnd() + ' ';
}).join('');

const parseBlocks = (lines: string[], context: MarkdownParserContext, depth: number, options: Required<MarkdownCodecOptions>): DocumentNode[] => {
  if (depth > maximumMarkdownDepth) throw new RangeError('Markdown exceeds structural limits.');
  consumeWork(context.budget, lines.reduce((total, line) => total + line.length + 1, 0));
  const output: DocumentNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (readMarkdownReference(line, context)) { index++; continue; }
    if (indentedCode(line)) {
      const content: string[] = [];
      while (index < lines.length && (indentedCode(lines[index]) || !lines[index].trim()))
        content.push(lines[index++].replace(/^(?: {4}|\t)/, ''));
      while (content.at(-1) === '') content.pop();
      output.push(context.element('pre', [context.text(content.join('\n'), depth + 1)], depth));
      continue;
    }
    const codeFence = fence(line);
    if (codeFence) {
      const marker = codeFence[1][0];
      const size = codeFence[1].length;
      const content: string[] = [];
      index++;
      for (; index < lines.length; index++) {
        const close = /^ {0,3}([`~]+)\s*$/.exec(lines[index]);
        if (close && close[1].length >= size && [...close[1]].every((char) => char === marker)) { index++; break; }
        content.push(lines[index]);
      }
      output.push(context.element('pre', [context.text(content.join('\n'), depth + 1)], depth));
      continue;
    }
    const title = heading(line);
    if (title) {
      const body = title[2].replace(/[ \t]+#+[ \t]*$/, '');
      output.push(context.element(`h${title[1].length}` as DocumentTag, deferredInline(body, context, depth + 1), depth));
      index++;
      continue;
    }
    if (thematic(line)) {
      output.push(context.element('hr', [], depth));
      index++;
      continue;
    }
    if (quote(line)) {
      const quoted: string[] = [];
      while (index < lines.length && quote(lines[index])) quoted.push(lines[index++].replace(/^ {0,3}> ?/, ''));
      output.push(context.element('blockquote', parseBlocks(quoted, context, depth + 1, options), depth));
      continue;
    }
    const firstItem = listMarker(line);
    if (firstItem) {
      const items: DocumentNode[] = [];
      while (index < lines.length) {
        const item = listMarker(lines[index]);
        if (!item || item.kind !== firstItem.kind || thematic(lines[index])) break;
        const task = options.taskLists ? /^\[([ xX])\](?:[ \t]+(.*)|$)/.exec(item.content) : null;
        const content = [task ? task[2] ?? '' : item.content];
        index++;
        while (index < lines.length) {
          if (/^ {2}/.test(lines[index])) content.push(lines[index++].slice(2));
          else if (!lines[index].trim() && /^ {2}/.test(lines[index + 1] ?? '')) { content.push(''); index++; }
          else break;
        }
        const bodies = parseBlocks(content, context, depth + 2, options);
        items.push(context.element('li', bodies.length ? bodies : [context.element('p', [], depth + 2)], depth + 1,
          task ? { [checklistAttribute]: String(task[1].toLowerCase() === 'x') } : {}));
      }
      output.push(context.element(firstItem.kind, items, depth, firstItem.kind === 'ol' && firstItem.number !== 1 ? { start: String(firstItem.number) } : {}));
      continue;
    }
    if (tableHeader(line, lines[index + 1])) {
      const head = tableCells(line);
      const alignments = tableCells(lines[index + 1]).map((value) => value.startsWith(':')
        ? value.endsWith(':') ? 'center' : 'left' : value.endsWith(':') ? 'right' : undefined);
      const rows: DocumentNode[] = [];
      const row = (cells: string[], header: boolean): void => {
        rows.push(context.element('tr', cells.map((cell, column) => context.element(header ? 'th' : 'td', deferredInline(cell, context, depth + 3), depth + 2,
          options.tableAlignment && alignments[column] ? { style: `text-align: ${alignments[column]}` } : {})), depth + 1));
      };
      row(head, true);
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        const cells = tableCells(lines[index]);
        if (cells.length !== head.length) break;
        if (rows.length >= 100) throw new RangeError('Markdown tables exceed 100 rows.');
        row(cells, false);
        index++;
      }
      output.push(context.element('table', rows, depth));
      continue;
    }
    const paragraph = [line];
    index++;
    while (index < lines.length && lines[index].trim() && !blockStart(lines, index) && !setext(lines[index])) paragraph.push(lines[index++]);
    const level = index < lines.length ? setext(lines[index]) : undefined;
    if (level) index++;
    output.push(context.element(level ? `h${level}` as DocumentTag : 'p', deferredInline(paragraphText(paragraph, level ? false : index < lines.length), context, depth + 1), depth));
  }
  return output;
};

export const parseMarkdown = (source: string, inputOptions?: MarkdownCodecOptions): EditorDocument => {
  assertMarkdownLength(source);
  const options = markdownOptions(inputOptions);
  const budget = createMarkdownBudget();
  const context: MarkdownParserContext = {
    budget,
    references: new Map(),
    inlineTasks: [],
    text: (text, depth) => { consumeNode(budget, depth); return { type: 'text', text }; },
    element: (tag, children, depth, attributes = {}) => { consumeNode(budget, depth); return { type: 'element', tag, attributes, children }; },
  };
  const normalized = source.replace(/\r\n?/g, '\n');
  const children = parseBlocks(normalized.split('\n'), context, 0, options);
  for (const task of context.inlineTasks) task.target.push(...parseMarkdownInline(task.source, context, task.depth));
  return markdownSchema(options).validateDocument({ version: 1, children });
};
