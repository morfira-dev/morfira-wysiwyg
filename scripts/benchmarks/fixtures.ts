import type { DocumentNode, DocumentTag, EditorDocument, ElementNode, TextNode } from '@morfira-dev/wysiwyg-core';
import type { BenchmarkFixture, BenchmarkFixtureCounts, BenchmarkParagraphs } from './types.js';

export const benchmarkParagraphCounts: readonly BenchmarkParagraphs[] = Object.freeze([100, 1000, 5000]);
const targetText = 'Benchmark target';

const text = (value: string): TextNode => ({ type: 'text', text: value });
const element = (tag: DocumentTag, children: DocumentNode[], attributes: Record<string, string> = {}): ElementNode => ({
  type: 'element', tag, attributes, children,
});
const paragraph = (value: string): ElementNode => element('p', [text(value)]);

const sectionTable = (section: string): ElementNode => element('table', [
  element('tbody', [
    element('tr', [
      element('td', [paragraph(`Merged ${section}`)], { rowspan: '2' }),
      element('td', [paragraph(`A ${section}`)]),
      element('td', [paragraph(`B ${section}`)]),
    ]),
    element('tr', [
      element('td', [paragraph(`C ${section}`)]),
      element('td', [paragraph(`D ${section}`)]),
    ]),
  ]),
]);

const sectionList = (section: string): ElementNode => element('ul', [
  element('li', [
    text(`Parent ${section}`),
    element('ol', [
      element('li', [text(`Nested first ${section}`)]),
      element('li', [text(`Nested second ${section}`)]),
    ]),
  ]),
  element('li', [text(`Sibling ${section}`)]),
]);

const escapeHTML = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

/** Serializes only the fixture's own typed nodes; never used as a general HTML boundary. */
const fixtureHTML = (node: DocumentNode): string => {
  if (node.type === 'text') return escapeHTML(node.text);
  const attributes = Object.entries(node.attributes).map(([name, value]) => ` ${name}="${escapeHTML(value)}"`).join('');
  const open = `<${node.tag}${attributes}>`;
  if (['br', 'hr', 'img', 'col'].includes(node.tag)) return open;
  return `${open}${node.children.map(fixtureHTML).join('')}</${node.tag}>`;
};

const countDocument = (document: EditorDocument): BenchmarkFixtureCounts => {
  const counts: BenchmarkFixtureCounts = {
    textContent: '', textLength: 0, paragraphCount: 0, tableCount: 0, cellCount: 0, nodeCount: 0, maxDepth: 0,
  };
  const fragments: string[] = [];
  const visit = (node: DocumentNode, depth: number): void => {
    counts.nodeCount++;
    counts.maxDepth = Math.max(counts.maxDepth, depth);
    if (node.type === 'text') {
      fragments.push(node.text);
      return;
    }
    if (node.tag === 'p') counts.paragraphCount++;
    if (node.tag === 'table') counts.tableCount++;
    if (node.tag === 'td' || node.tag === 'th') counts.cellCount++;
    node.children.forEach((child) => visit(child, depth + 1));
  };
  document.children.forEach((node) => visit(node, 0));
  counts.textContent = fragments.join('');
  counts.textLength = counts.textContent.length;
  return counts;
};

/** Synthetic mixed content stays deterministic across locales, browsers and process runs. */
export const createBenchmarkFixture = (paragraphs: BenchmarkParagraphs): BenchmarkFixture => {
  if (!benchmarkParagraphCounts.includes(paragraphs)) throw new RangeError('Use a supported benchmark paragraph count: 100, 1000 or 5000.');
  const children: DocumentNode[] = [];
  for (let index = 0; index < paragraphs; index++) {
    const number = String(index + 1).padStart(5, '0');
    children.push(element('p', [
      text(`${index === 0 ? `${targetText} ` : 'Paragraph '}${number}: `),
      element('strong', [text('marked words')]),
      text(' with '),
      element('em', [text('emphasis')]),
      text(' and Unicode e\u0301 👩🏽‍💻. Stable sample text for editing.'),
    ]));
    if ((index + 1) % 50 === 0) {
      children.push(element('h2', [text(`Section ${number}`)]), sectionList(number), sectionTable(number));
    }
  }
  // Core normalizes a document ending in a table to include an editable tail.
  children.push(element('p', [element('br', [])]));
  const document: EditorDocument = { version: 1, children };
  const html = children.map(fixtureHTML).join('');
  const expected = countDocument(document);
  if (expected.nodeCount >= 100000 || expected.maxDepth >= 100 || html.length >= 5000000) {
    throw new RangeError('Benchmark fixture exceeds its structural or HTML budget.');
  }
  return {
    id: `mixed-${paragraphs}`, paragraphs, html, document, expected,
    search: { query: 'Stable sample text', matches: paragraphs },
    target: { index: 0, length: targetText.length, text: targetText },
  };
};
