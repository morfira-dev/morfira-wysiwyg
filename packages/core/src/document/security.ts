export const safeURL = (value: string, image: boolean): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u0020\u007f]/.test(trimmed))
    return;
  // Explicit protocols and relative references only. Never data:, blob:, or script URLs.
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(trimmed)?.[1].toLowerCase();
  if (protocol && !(image ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel']).includes(protocol))
    return;
  if (trimmed.startsWith('\\') || trimmed.startsWith('//'))
    return;
  return trimmed;
};
