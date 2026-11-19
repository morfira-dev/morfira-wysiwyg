import type { TableAlignment, TableCellVerticalAlign, TableCellBorderStyle, TablePropertiesPatch } from './types.js';
import { checkedRowMinHeight } from './rows.js';

const widthValue = (value: unknown): string | false => {
  if (value === false) return false;
  if (typeof value !== 'string') throw new TypeError('Table width must be a bounded integer px/% string or false.');
  const match = /^([1-9]\d{0,3})(px|%)$/.exec(value);
  if (!match || (match[2] === 'px' ? Number(match[1]) < 40 || Number(match[1]) > 4000 : Number(match[1]) > 100))
    throw new RangeError('Table width must be 40–4000px or 1–100%.');
  return value;
};
const alignmentValue = (value: unknown): TableAlignment | false => {
  if (value !== false && value !== 'left' && value !== 'center' && value !== 'right')
    throw new TypeError('Table alignment must be left, center, right or false.');
  return value;
};
const verticalValue = (value: unknown): TableCellVerticalAlign | false => {
  if (value !== false && value !== 'top' && value !== 'middle' && value !== 'bottom')
    throw new TypeError('Cell vertical alignment must be top, middle, bottom or false.');
  return value;
};
const cellLengthValue = (value: unknown, maximum: number): string | false => {
  if (value === false) return false;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d?)px$/.test(value) || Number(value.slice(0, -2)) > maximum)
    throw new TypeError(`Cell length must be a canonical integer from 0px to ${maximum}px or false.`);
  return value;
};
export const cellBorderStyle = (cell: HTMLTableCellElement): TableCellBorderStyle | false => {
  const style = cell.style.borderStyle;
  return style === 'solid' || style === 'dashed' || style === 'dotted' || style === 'double' || style === 'none' ? style : false;
};
const borderStyleValue = (value: unknown): TableCellBorderStyle | false => {
  if (value !== false && value !== 'solid' && value !== 'dashed' && value !== 'dotted' && value !== 'double' && value !== 'none')
    throw new TypeError('Unsupported cell border style.');
  return value;
};
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

/** Copy and validate the entire patch before target lookup or entering a transaction. */
export const checkedTablePropertiesPatch = (input: unknown, document: Document): TablePropertiesPatch => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input)))
    throw new TypeError('Table properties must be a plain patch object.');
  const fields = ['width', 'alignment', 'cellBackground', 'cellBorder', 'cellVerticalAlign', 'headerRow', 'headerColumn', 'caption', 'rowMinHeight', 'cellPadding', 'cellBorderWidth', 'cellBorderStyle'];
  if (Reflect.ownKeys(input).some((key) => typeof key !== 'string' || !fields.includes(key)))
    throw new TypeError('Unknown table property.');
  const patch = input as Record<string, unknown>;
  const result: TablePropertiesPatch = {};
  if (Object.hasOwn(patch, 'cellPadding')) result.cellPadding = cellLengthValue(patch.cellPadding, 48);
  if (Object.hasOwn(patch, 'cellBorderWidth')) result.cellBorderWidth = cellLengthValue(patch.cellBorderWidth, 12);
  if (Object.hasOwn(patch, 'cellBorderStyle')) result.cellBorderStyle = borderStyleValue(patch.cellBorderStyle);
  if (Object.hasOwn(patch, 'rowMinHeight')) result.rowMinHeight = checkedRowMinHeight(patch.rowMinHeight);
  for (const key of ['headerRow', 'headerColumn'] as const) {
    if (!Object.hasOwn(patch, key)) continue;
    if (typeof patch[key] !== 'boolean') throw new TypeError('Table header axes must be boolean.');
    result[key] = patch[key];
  }
  if (Object.hasOwn(patch, 'caption')) {
    const caption = patch.caption;
    if (caption !== false && (typeof caption !== 'string' || caption.length > 5000))
      throw new TypeError('Table caption must be text of at most 5000 characters or false.');
    result.caption = caption === '' ? false : caption;
  }
  if (Object.hasOwn(patch, 'width')) result.width = widthValue(patch.width);
  if (Object.hasOwn(patch, 'alignment')) result.alignment = alignmentValue(patch.alignment);
  if (Object.hasOwn(patch, 'cellBackground')) result.cellBackground = colorValue(patch.cellBackground, document);
  if (Object.hasOwn(patch, 'cellBorder')) result.cellBorder = colorValue(patch.cellBorder, document);
  if (Object.hasOwn(patch, 'cellVerticalAlign')) result.cellVerticalAlign = verticalValue(patch.cellVerticalAlign);
  return result;
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
export const cellVerticalAlign = (cell: HTMLTableCellElement): TableCellVerticalAlign | false => {
  const value = cell.style.verticalAlign;
  return value === 'top' || value === 'middle' || value === 'bottom' ? value : false;
};
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
