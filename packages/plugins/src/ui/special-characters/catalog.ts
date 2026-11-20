import type { SpecialCharacter, SpecialCharacterUIMessageKey } from './types.js';

const characters = [
  ['copyright', '©'], ['registered', '®'], ['trademark', '™'], ['euro', '€'],
  ['pound', '£'], ['yen', '¥'], ['ruble', '₽'], ['cent', '¢'],
  ['emDash', '—'], ['enDash', '–'], ['ellipsis', '…'], ['bullet', '•'],
  ['leftQuote', '“'], ['rightQuote', '”'], ['leftGuillemet', '«'], ['rightGuillemet', '»'],
  ['degree', '°'], ['plusMinus', '±'], ['multiply', '×'], ['divide', '÷'],
  ['notEqual', '≠'], ['lessEqual', '≤'], ['greaterEqual', '≥'], ['approximately', '≈'],
  ['infinity', '∞'], ['squareRoot', '√'], ['pi', 'π'], ['sum', '∑'],
  ['arrowLeft', '←'], ['arrowRight', '→'], ['check', '✓'], ['section', '§'],
] as const;

export const defaultCharacters = (message: (key: SpecialCharacterUIMessageKey) => string): SpecialCharacter[] => characters.map(([id, text]) => ({
  id, text, label: message(`ui.specialCharacters.${id}`),
}));

const invalidText = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const ordinaryString = (value: unknown, maximum: number): value is string => typeof value === 'string'
  && value.length > 0 && value.length <= maximum && !invalidText.test(value)
  && !/[\uD800-\uDFFF]/u.test(value);

export const snapshotCharacters = (input: unknown): readonly SpecialCharacter[] => {
  if (!Array.isArray(input) || input.length < 1 || input.length > 256) throw new TypeError('Expected 1–256 special characters.');
  const ids = new Set<string>();
  return Array.from(input, (item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('Expected a special-character record.');
    const record = item as Record<string, unknown>;
    if (Object.keys(record).some((key) => !['id', 'text', 'label'].includes(key))
      || typeof record.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(record.id) || ids.has(record.id)
      || !ordinaryString(record.text, 64) || [...record.text].length > 16 || !ordinaryString(record.label, 160))
      throw new TypeError('Invalid special-character ID, text or label.');
    ids.add(record.id);
    return Object.freeze({ id: record.id, text: record.text, label: record.label });
  });
};

export const validPanelLabel = (value: unknown): value is string => ordinaryString(value, 160);
