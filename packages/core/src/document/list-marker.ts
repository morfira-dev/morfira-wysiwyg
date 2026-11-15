const markers: Readonly<Record<string, readonly string[]>> = {
  ul: ['disc', 'circle', 'square'],
  ol: ['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'],
};

export const normalizeListMarker = (tag: string, value: string): string | undefined => {
  const marker = value.trim().toLowerCase();
  return Object.hasOwn(markers, tag) && markers[tag].includes(marker) ? marker : undefined;
};
