/** Only uniform, bounded cell geometry is persisted; no general CSS passthrough. */
export const normalizeCellBoxStyle = (tag: string, property: string, value: string): string | undefined => {
  if (tag !== 'td' && tag !== 'th') return;
  if (property === 'border-style')
    return ['solid', 'dashed', 'dotted', 'double', 'none'].includes(value) ? value : undefined;
  if (property !== 'padding' && property !== 'border-width') return;
  if (!/^(?:0|[1-9]\d?)px$/.test(value)) return;
  return Number(value.slice(0, -2)) <= (property === 'padding' ? 48 : 12) ? value : undefined;
};

/** CSSOM can consolidate an explicit width/style/color triple into border. */
export const normalizeCellBorder = (tag: string, value: string): string | undefined => {
  if (tag !== 'td' && tag !== 'th') return;
  const match = /^((?:0|[1-9]\d?)px)\s+(solid|dashed|dotted|double|none)\s+(.+)$/.exec(value);
  if (!match || Number(match[1].slice(0, -2)) > 12) return;
  const color = match[3];
  if (!/^(#[a-f\d]{3,8}|[a-z]{1,24}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\))$/.test(color)
    || ['inherit', 'initial', 'unset', 'revert', 'revert-layer'].includes(color)) return;
  // Keep the shorthand atomic: an unsupported color must not apply width/style.
  return `border: ${match[1]} ${match[2]} ${color}`;
};
