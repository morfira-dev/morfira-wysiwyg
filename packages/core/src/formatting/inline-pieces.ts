/** Shared structural boundary set for the two independent inline visitors. */
export const inlineBlockTags: ReadonlySet<string> = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'figure', 'figcaption']);

/** Split one UTF-16 text leaf without changing either visitor's position or
 * wrapper/link/compaction policy. Empty fragments never reach the caller. */
export const splitSelectedText = <T>(text: string, start: number, from: number, to: number, piece: (text: string, selected: boolean) => T): T[] => {
  const left = Math.max(0, Math.min(text.length, from - start));
  const right = Math.max(left, Math.min(text.length, to - start));
  return [[0, left, false], [left, right, true], [right, text.length, false]].flatMap(([begin, end, selected]) => {
    const fragment = text.slice(begin as number, end as number);
    return fragment ? [piece(fragment, Boolean(selected))] : [];
  });
};
