import { createDocumentSchema } from '@morfira-dev/wysiwyg-core';
import type { DocumentNode, EditorDocument, ElementNode } from '@morfira-dev/wysiwyg-core';
import { maximumMarkdownDepth, maximumMarkdownLength, maximumMarkdownNodes } from './budget.js';
import type { MarkdownExportEntry } from './serialize.types.js';

const join = (parts: readonly string[], separator = ''): string => {
  let length = Math.max(0, parts.length - 1) * separator.length;
  for (const part of parts) {
    length += part.length;
    if (length > maximumMarkdownLength) throw new RangeError('Markdown output exceeds the size limit.');
  }
  return parts.join(separator);
};
const punctuation = /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/g;
const escape = (value: string, lineBreaks = false): string => {
  let length = value.length;
  for (const char of value) {
    if (/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(char)) length++;
    else if (lineBreaks && char === '\n') length++;
    if (length > maximumMarkdownLength)
      throw new RangeError('Escaped Markdown exceeds the size limit.');
  }
  const escaped = value.replace(punctuation, '\\$&');
  return lineBreaks ? escaped.replace(/\n/g, '\\\n') : escaped;
};
const indent = (value: string, prefix: string): string => {
  let lines = 1;
  for (const char of value) if (char === '\n') lines++;
  if (value.length + lines * prefix.length > maximumMarkdownLength)
    throw new RangeError('Indented Markdown exceeds the size limit.');
  return join(value.split('\n').map((line) => prefix + line), '\n');
};
const plain = (nodes: readonly DocumentNode[], multiline: boolean): string => join(nodes.map((node) => {
  if (node.type === 'text') return node.text;
  if (node.tag === 'br') {
    if (!multiline) throw new TypeError('Multiline inline code is not supported by the Markdown codec.');
    return '\n';
  }
  if (!['span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'code'].includes(node.tag))
    throw new TypeError('Markdown code can contain only text and inline marks.');
  return plain(node.children, multiline);
}));
const code = (value: string, block: boolean): string => {
  if (!block && /[\r\n]/.test(value)) throw new TypeError('Multiline inline code is not supported by the Markdown codec.');
  if (!block && !value) return '';
  let longest = 0;
  let run = 0;
  for (const char of value) {
    run = char === '`' ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const size = Math.max(block ? 3 : 1, longest + 1);
  const padded = !block && (value.startsWith('`') || value.endsWith('`')
    || (value.startsWith(' ') && value.endsWith(' ') && Boolean(value.trim())));
  if (value.length + 2 * size + (block || padded ? 2 : 0) > maximumMarkdownLength)
    throw new RangeError('Markdown code delimiters exceed the size limit.');
  const fence = '`'.repeat(size);
  return join(block ? [fence, '\n', value.replace(/\r\n?/g, '\n'), '\n', fence]
    : [fence, padded ? ' ' : '', value, padded ? ' ' : '', fence]);
};
const target = (value: string): string => {
  let extra = 0;
  for (const char of value) if (char === '<' || char === '>' || char === '|' || char === '\\') extra += 2;
  if (value.length + extra > maximumMarkdownLength) throw new RangeError('Markdown destination exceeds the size limit.');
  return value.replace(/[<>|\\]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
};
const title = (value: string | undefined): string => value ? join([' "', escape(value.replace(/\s+/g, ' ')), '"']) : '';
const inline = (nodes: readonly DocumentNode[], active: readonly string[] = [], insideLink = false): string => join(nodes.map((node) => {
  if (node.type === 'text') return escape(node.text.replace(/\r\n?/g, '\n'), true);
  if (node.tag === 'br') return '\\\n';
  if (node.tag === 'code') return code(plain(node.children, false), false);
  if (node.tag === 'img') {
    const label = escape((node.attributes.alt ?? '').replace(/\s+/g, ' '));
    return node.attributes.src ? join(['![', label, '](<', target(node.attributes.src), '>', title(node.attributes.title), ')']) : label;
  }
  const mark = node.tag === 'strong' ? '**' : node.tag === 'em' ? '_' : node.tag === 's' ? '~~' : undefined;
  if (mark && !active.includes(node.tag)) {
    const body = inline(node.children, [...active, node.tag], insideLink);
    return body ? join([mark, body, mark]) : '';
  }
  if (node.tag === 'a') {
    if (!node.attributes.href) return inline(node.children, active, insideLink);
    if (insideLink) throw new TypeError('Nested links are not supported by the Markdown codec.');
    const body = inline(node.children, active, true);
    return join(['[', body, '](<', target(node.attributes.href), '>', title(node.attributes.title), ')']);
  }
  if (['span', 'u', 'sub', 'sup', 'strong', 'em', 's'].includes(node.tag)) return inline(node.children, active, insideLink);
  throw new TypeError(`Unsupported Markdown inline structure: ${node.tag}.`);
}));

const whitespace = (node: DocumentNode): boolean => node.type === 'text' && !node.text.trim();
const table = (node: ElementNode): string => {
  const rows: ElementNode[] = [];
  const captions: string[] = [];
  for (const child of node.children) {
    if (whitespace(child)) continue;
    if (child.type !== 'element') throw new TypeError('Markdown tables require ordinary rows.');
    if (child.tag === 'tr') rows.push(child);
    else if (['thead', 'tbody', 'tfoot'].includes(child.tag)) {
      for (const row of child.children) {
        if (whitespace(row)) continue;
        if (row.type !== 'element' || row.tag !== 'tr') throw new TypeError('Markdown table sections require ordinary rows.');
        rows.push(row);
      }
    }
    else if (child.tag === 'caption') captions.push(inline(child.children));
    else if (!['colgroup', 'col'].includes(child.tag)) throw new TypeError('Unsupported Markdown table structure.');
  }
  if (!rows.length) throw new TypeError('Markdown tables need at least one row.');
  if (rows.length > 100) throw new RangeError('Markdown tables exceed 100 rows.');
  let columns: number | undefined;
  const lines = rows.map((row) => {
    const cells = row.children.filter((child) => !whitespace(child));
    if (!cells.length || (columns !== undefined && columns !== cells.length)) throw new TypeError('Markdown tables must be rectangular.');
    if (cells.length > 100) throw new RangeError('Markdown tables exceed 100 columns.');
    columns = cells.length;
    return join(['| ', join(cells.map((cell) => {
      if (cell.type !== 'element' || !['td', 'th'].includes(cell.tag)
        || Number(cell.attributes.rowspan ?? '1') !== 1 || Number(cell.attributes.colspan ?? '1') !== 1)
        throw new TypeError('Merged cells are not supported by the Markdown codec.');
      const content = cell.children.filter((child) => !whitespace(child));
      const body = content.length === 1 && content[0].type === 'element' && content[0].tag === 'p'
        ? inline(content[0].children) : inline(cell.children);
      if (body.includes('\n')) throw new TypeError('Markdown table cells require one inline text flow.');
      return body;
    }), ' | '), ' |']);
  });
  lines.splice(1, 0, join(['| ', join(Array.from({ length: columns! }, () => '---'), ' | '), ' |']));
  return join([...captions, join(lines, '\n')], '\n\n');
};

const blocks = (nodes: readonly DocumentNode[]): string => {
  const output: string[] = [];
  let run: DocumentNode[] = [];
  const flush = (): void => {
    if (run.some((node) => !whitespace(node))) output.push(inline(run));
    run = [];
  };
  for (const node of nodes) {
    if (node.type === 'text' || ['strong', 'em', 'u', 's', 'sub', 'sup', 'a', 'span', 'br', 'code', 'img'].includes(node.tag)) {
      run.push(node);
      continue;
    }
    flush();
    if (node.tag === 'p' || node.tag === 'figcaption') output.push(inline(node.children));
    else if (/^h[1-6]$/.test(node.tag)) {
      const body = inline(node.children);
      if (body.includes('\n')) throw new TypeError('Markdown headings require one inline text flow.');
      output.push(join(['#'.repeat(Number(node.tag[1])), ' ', body]));
    }
    else if (node.tag === 'hr') output.push('---');
    else if (node.tag === 'pre') output.push(code(plain(node.children, true), true));
    else if (node.tag === 'blockquote') output.push(indent(blocks(node.children), '> '));
    else if (node.tag === 'ul' || node.tag === 'ol') {
      const number = Number(node.attributes.start ?? '1');
      if (node.tag === 'ol' && (number < 0 || number > 999999999))
        throw new TypeError('Markdown ordered-list starts require at most nine nonnegative decimal digits.');
      const items: string[] = [];
      for (const item of node.children) {
        if (whitespace(item)) continue;
        if (item.type !== 'element' || item.tag !== 'li') throw new TypeError('Markdown lists require ordinary list items.');
        const body = blocks(item.children);
        const lines = body.split('\n');
        // A Markdown list owns its initial counter; repeating the valid initial
        // marker avoids overflow at the end of the bounded nine-digit range.
        const first = join([node.tag === 'ol' ? `${number}. ` : '- ', lines[0]]);
        items.push(join([first, ...(lines.length > 1 ? ['\n', indent(join(lines.slice(1), '\n'), '  ')] : [])]));
      }
      output.push(join(items, '\n'));
    }
    else if (node.tag === 'table') output.push(table(node));
    else if (node.tag === 'figure') output.push(blocks(node.children));
    else throw new TypeError(`Unsupported Markdown block structure: ${node.tag}.`);
  }
  flush();
  return join(output, '\n\n');
};

/** Serialize validated document data without creating or reading a DOM. */
export const serializeMarkdown = (input: EditorDocument): string => {
  if (!input || input.version !== 1 || !Array.isArray(input.children)) throw new TypeError('Expected a schema-v1 document.');
  const pending: MarkdownExportEntry[] = [];
  if (input.children.length > maximumMarkdownNodes) throw new RangeError('Markdown exceeds structural limits.');
  for (const node of input.children) pending.push({ node, depth: 0, inTable: false });
  let nodes = 0;
  let length = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    const node = entry.node;
    if (++nodes > maximumMarkdownNodes || entry.depth > maximumMarkdownDepth) throw new RangeError('Markdown exceeds structural limits.');
    if (!node || typeof node !== 'object') throw new TypeError('Invalid Markdown document node.');
    if (node.type === 'text') {
      if (typeof node.text !== 'string') throw new TypeError('Invalid Markdown text node.');
      length += node.text.length;
    }
    else {
      if (node.type !== 'element' || !Array.isArray(node.children) || !node.attributes || typeof node.attributes !== 'object')
        throw new TypeError('Invalid Markdown element node.');
      if (entry.inTable && node.tag === 'table') throw new TypeError('Nested tables are not supported by the Markdown codec.');
      for (const key in node.attributes) if (Object.hasOwn(node.attributes, key)) {
        length += key.length;
        const value = node.attributes[key];
        if (typeof value === 'string') length += value.length;
      }
      if (pending.length + node.children.length > maximumMarkdownNodes - nodes) throw new RangeError('Markdown exceeds structural limits.');
      for (const child of node.children) pending.push({ node: child, depth: entry.depth + 1, inTable: entry.inTable || node.tag === 'table' });
    }
    if (length > maximumMarkdownLength) throw new RangeError('Markdown source document exceeds the size limit.');
  }
  return blocks(createDocumentSchema().validateDocument(input).children);
};
