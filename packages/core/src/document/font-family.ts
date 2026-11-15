const genericFamilies = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong']);
const wideKeywords = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'default']);
const identifier = /^-?[a-z_][a-z\d_-]*$/i;

/** A deliberately small inert CSS subset, shared by HTML and JSON validation. */
export const normalizeFontFamily = (input: string): string | undefined => {
  if (!input || input.length > 256 || /[^\x20-\x7e]|[\\/()*;{}:]/.test(input)) return;
  const parts = input.split(',');
  if (parts.length > 8) return;
  const result: string[] = [];
  for (const part of parts) {
    const value = part.trim();
    const quoted = value.startsWith('"') || value.startsWith("'");
    if (quoted && (value.length < 3 || value.at(-1) !== value[0])) return;
    const name = (quoted ? value.slice(1, -1) : value).trim().replace(/ +/g, ' ');
    if (!name || !/^[a-z\d_ -]+$/i.test(name) || wideKeywords.has(name.toLowerCase())) return;
    const generic = genericFamilies.has(name.toLowerCase());
    if (!quoted && name.split(' ').some((word) => !identifier.test(word))) return;
    if (!quoted && generic) result.push(name.toLowerCase());
    else if (!generic && identifier.test(name)) result.push(name);
    else result.push(`"${name}"`);
  }
  const normalized = result.join(', ');
  return normalized.length <= 256 ? normalized : undefined;
};
