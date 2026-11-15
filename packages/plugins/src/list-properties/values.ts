import type { ListMarker } from './types.js';

const bullets: readonly ListMarker[] = ['disc', 'circle', 'square'];
const ordered: readonly ListMarker[] = ['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'];

export const markerFor = (list: HTMLElement, value: ListMarker): boolean => (list.localName === 'ol' ? ordered : bullets).includes(value);

export const startValue = (value: unknown): number | false => {
  if (value !== false && (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 2147483647))
    throw new TypeError('List start must be a signed 32-bit integer or false.');
  return value as number | false;
};

export const reversedValue = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new TypeError('Reversed must be boolean.');
  return value;
};

export const markerValue = (value: unknown): ListMarker | false => {
  if (value !== false && (typeof value !== 'string' || ![...bullets, ...ordered].includes(value as ListMarker)))
    throw new TypeError('Expected a supported list marker or false.');
  return value as ListMarker | false;
};

export const explicitStart = (list: HTMLElement): number | false => {
  if (list.localName !== 'ol' || !list.hasAttribute('start')) return false;
  const raw = list.getAttribute('start')!;
  if (raw.length > 20000 || !/^[+-]?\d+$/.test(raw.trim())) return false;
  const value = Number(raw);
  return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 ? value : false;
};

export const explicitMarker = (list: HTMLElement): ListMarker | false => {
  const value = list.style.getPropertyValue('list-style-type').trim().toLowerCase();
  return (list.localName === 'ol' ? ordered : bullets).includes(value as ListMarker) ? value as ListMarker : false;
};
