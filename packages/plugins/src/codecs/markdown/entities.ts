// A deliberately documented common set. Unknown HTML5 names remain literal.
const entities: Readonly<Record<string, string>> = {
  amp: '&', AMP: '&', lt: '<', LT: '<', gt: '>', GT: '>', quot: '"', QUOT: '"', apos: "'", nbsp: '\u00a0',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', divide: '÷', plusmn: '±',
  deg: '°', micro: 'µ', para: '¶', sect: '§', shy: '\u00ad', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009',
  eacute: 'é', Eacute: 'É', aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À',
  ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', auml: 'ä', Auml: 'Ä', szlig: 'ß',
};
const controls: Readonly<Record<number, number>> = {
  128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710,
  137: 8240, 138: 352, 139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220,
  148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250,
  156: 339, 158: 382, 159: 376,
};

export const decodeMarkdownEntities = (value: string): string => value.replace(/&(?:#(x[\da-f]{1,6}|\d{1,8})|([a-z][\da-z]{1,31}));/gi,
  (literal, numeric: string | undefined, named: string | undefined) => {
    if (named) return Object.hasOwn(entities, named) ? entities[named] : literal;
    const number = Number.parseInt(numeric!.replace(/^x/i, ''), /^x/i.test(numeric!) ? 16 : 10);
    if (!number || number > 0x10ffff || number >= 0xd800 && number <= 0xdfff) return '\ufffd';
    return String.fromCodePoint(controls[number] ?? number);
  });

/** One pass prevents an escaped ampersand from starting a new entity. */
export const decodeMarkdownString = (value: string): string => value.replace(/\\([!-/:-@[-`{-~])|&(?:#(?:x[\da-f]{1,6}|\d{1,8})|[a-z][\da-z]{1,31});/gi,
  (literal, escaped: string | undefined) => escaped ?? decodeMarkdownEntities(literal));
