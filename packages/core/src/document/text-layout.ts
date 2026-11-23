/** Only ordinary paragraph/heading layout can persist these bounded declarations. */
export const normalizeTextLayoutStyle = (tag: string, property: string, value: string): string | undefined => {
  if (!/^(?:p|h[1-6])$/.test(tag)) return;
  const text = value.trim().toLowerCase();
  if (property === 'line-height') {
    if (!/^(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/.test(text)) return;
    const number = Number(text);
    if (number >= 0.5 && number <= 4) return String(number);
    return;
  }
  if ((property === 'margin-top' || property === 'margin-bottom') && /^\d{1,2}px$/.test(text)) {
    const number = Number(text.slice(0, -2));
    if (number <= 96) return `${number}px`;
  }
};
