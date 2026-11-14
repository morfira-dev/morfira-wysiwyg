import type { EditorUIIcon } from './types.js';

const paths: Partial<Record<EditorUIIcon, string>> = {
  undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
  redo: 'm15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7V4Zm0 8h7a4 4 0 0 1 0 8H7v-8Z',
  italic: 'M11 4h9M4 20h9M15 4 8 20',
  underline: 'M6 3v8a6 6 0 0 0 12 0V3M4 21h16',
  strike: 'M18 5c-2-3-11-3-11 2 0 4 10 3 10 8 0 5-9 5-12 2M3 11h18',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',
  subscript: 'm4 5 10 12M14 5 4 17m14 0c0-3 5-3 5 0 0 2-5 3-5 5h5',
  superscript: 'm3 8 10 12M13 8 3 20m15-16c0-3 5-3 5 0 0 2-5 3-5 5h5',
  blockquote: 'M4 5h6v7H5c0 3 2 4 4 5m5-12h6v7h-5c0 3 2 4 4 5',
  clear: 'm5 5 12 0m-6 0-4 14m7-5 7 7m0-7-7 7',
  indent: 'M10 5h12M10 12h12M10 19h12M2 9l4 3-4 3',
  outdent: 'M10 5h12M10 12h12M10 19h12M6 9l-4 3 4 3',
  link: 'm10 14 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  image: 'M3 3h18v18H3V3Zm0 14 5-5 4 4 4-6 5 7M7 7h1',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 6 6',
  block: 'M5 5h14M12 5v15M8 20h8',
  list: 'M9 5h13M9 12h13M9 19h13M3 5h1m-1 7h1m-1 7h1',
  align: 'M3 5h18M3 10h12M3 15h18M3 20h12',
  color: 'm5 18 7-15 7 15M8 12h8M3 22h18',
  background: 'm5 14 9-9 6 6-9 9H5v-6Zm-2 8h18',
  table: 'M3 4h18v16H3V4Zm0 5h18M3 14h18M9 4v16m6-16v16',
};
export const createEditorUIIcon = (document: Document, icon: EditorUIIcon): SVGSVGElement | undefined => {
  const d = paths[icon];
  if (!d) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
};
