import type { TableAlignment, TableCellVerticalAlign, TableCellBorderStyle, TableCellTextAlign, TableCellDirection, TablePropertiesPatch } from './types.js';
import type { TablePropertyValidators } from './internal-types.js';
import { checkedRowMinHeight } from './rows.js';
import { alignments, verticalAlignments, textAlignments, directions, borderStyles } from './choices.js';

const widthValue = (value: unknown): string | false => {
  if (value === false) return false;
  if (typeof value !== 'string') throw new TypeError('Table width must be a bounded integer px/% string or false.');
  const match = /^([1-9]\d{0,3})(px|%)$/.exec(value);
  if (!match || (match[2] === 'px' ? Number(match[1]) < 40 || Number(match[1]) > 4000 : Number(match[1]) > 100))
    throw new RangeError('Table width must be 40–4000px or 1–100%.');
  return value;
};
const enumValue = <Value extends string>(value: unknown, choices: readonly Value[]): Value | false =>
  choices.includes(value as Value) ? value as Value : false;
const checkedEnumValue = <Value extends string>(value: unknown, choices: readonly Value[], message: string): Value | false => {
  if (value === false) return false;
  const result = enumValue(value, choices);
  if (result === false) throw new TypeError(message);
  return result;
};
const cellLengthValue = (value: unknown, maximum: number): string | false => {
  if (value === false) return false;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d?)px$/.test(value) || Number(value.slice(0, -2)) > maximum)
    throw new TypeError(`Cell length must be a canonical integer from 0px to ${maximum}px or false.`);
  return value;
};
export const cellBorderStyle = (cell: HTMLTableCellElement): TableCellBorderStyle | false => enumValue(cell.style.borderStyle, borderStyles);
const colorValue = (value: unknown, document: Document): string | false => {
  if (value === false) return false;
  if (typeof value !== 'string' || !value.length || value.length > 100)
    throw new TypeError('Cell color must be a bounded color string or false.');
  const color = value.trim().toLowerCase();
  if (!/^(#[a-f\d]{3,8}|[a-z]{1,24}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\))$/.test(color)
      || ['inherit', 'initial', 'unset', 'revert'].includes(color))
    throw new TypeError('Unsupported cell color.');
  const style = document.createElement('span').style;
  style.color = color;
  if (!style.color) throw new TypeError('Unsupported cell color.');
  return style.color;
};

const headerValue = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new TypeError('Table header axes must be boolean.');
  return value;
};
const captionValue = (caption: unknown): string | false => {
  if (caption !== false && (typeof caption !== 'string' || caption.length > 5000))
    throw new TypeError('Table caption must be text of at most 5000 characters or false.');
  return caption === '' ? false : caption;
};

// Insertion order preserves validation/getter order before target lookup.
const propertyValidators: TablePropertyValidators = {
  cellTextAlign: (value) => checkedEnumValue(value, textAlignments, 'Cell text alignment must be left, center, right, justify or false.'),
  cellDirection: (value) => checkedEnumValue(value, directions, 'Cell direction must be ltr, rtl or false.'),
  cellPadding: (value) => cellLengthValue(value, 48),
  cellBorderWidth: (value) => cellLengthValue(value, 12),
  cellBorderStyle: (value) => checkedEnumValue(value, borderStyles, 'Unsupported cell border style.'),
  rowMinHeight: checkedRowMinHeight,
  headerRow: headerValue,
  headerColumn: headerValue,
  caption: captionValue,
  width: widthValue,
  alignment: (value) => checkedEnumValue(value, alignments, 'Table alignment must be left, center, right or false.'),
  cellBackground: colorValue,
  cellBorder: colorValue,
  cellVerticalAlign: (value) => checkedEnumValue(value, verticalAlignments, 'Cell vertical alignment must be top, middle, bottom or false.'),
};

/** Copy and validate the entire patch before target lookup or entering a transaction. */
export const checkedTablePropertiesPatch = (input: unknown, document: Document): TablePropertiesPatch => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input)))
    throw new TypeError('Table properties must be a plain patch object.');
  if (Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !Object.hasOwn(propertyValidators, key)))
    throw new TypeError('Unknown table property.');
  const patch = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, validate] of Object.entries(propertyValidators)) {
    if (!Object.hasOwn(patch, key)) continue;
    const value = validate(patch[key], document);
    // Header axes historically read an accessor again after its boolean check.
    result[key] = key === 'headerRow' || key === 'headerColumn' ? patch[key] : value;
  }
  return result as TablePropertiesPatch;
};

export const tableWidth = (table: HTMLTableElement): string | false => {
  const width = table.style.width;
  if (width) return width;
  const attribute = table.getAttribute('width');
  return attribute && /^\d{1,4}$/.test(attribute) && Number(attribute) > 0 && Number(attribute) <= 1000
    ? `${Number(attribute)}px` : false;
};
export const tableAlignment = (table: HTMLTableElement): TableAlignment | false => {
  const { marginLeft, marginRight } = table.style;
  if (marginLeft === 'auto' && marginRight === 'auto') return 'center';
  if (marginLeft === '0px' && marginRight === 'auto') return 'left';
  if (marginLeft === 'auto' && marginRight === '0px') return 'right';
  return false;
};
export const cellVerticalAlign = (cell: HTMLTableCellElement): TableCellVerticalAlign | false => enumValue(cell.style.verticalAlign, verticalAlignments);
export const cellTextAlign = (cell: HTMLTableCellElement): TableCellTextAlign | false => enumValue(cell.style.textAlign, textAlignments);
export const cellDirection = (cell: HTMLTableCellElement): TableCellDirection | false => enumValue(cell.getAttribute('dir'), directions);
export const mixedCellValue = <T extends string | false>(cells: readonly HTMLTableCellElement[], read: (cell: HTMLTableCellElement) => T): T | 'mixed' => {
  const first = read(cells[0]);
  return cells.some((cell) => read(cell) !== first) ? 'mixed' : first;
};
export const patchMargins = (alignment: TableAlignment | false): readonly [string | false, string | false] => alignment === false
  ? [false, false] : [alignment === 'left' ? '0px' : 'auto', alignment === 'right' ? '0px' : 'auto'];
export const styleChanges = (element: HTMLElement, property: string, value: string | false): boolean => value === false
  ? Boolean(element.style.getPropertyValue(property))
  : element.style.getPropertyValue(property) !== value || Boolean(element.style.getPropertyPriority(property));
export const writeStyle = (element: HTMLElement, property: string, value: string | false): void => {
  if (value === false) element.style.removeProperty(property);
  else element.style.setProperty(property, value);
  if (!element.style.length) element.removeAttribute('style');
};
