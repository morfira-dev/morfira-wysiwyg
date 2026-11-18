import type { ImageResize, ImageValue } from './types.js';

const dimension = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= 1000;

export const imageSizeSignature = (image: HTMLImageElement): string => JSON.stringify([
  image.getAttribute('src'), image.getAttribute('width'), image.getAttribute('height'),
  dimension(Number(image.getAttribute('width'))) && dimension(Number(image.getAttribute('height'))) ? null : [image.naturalWidth, image.naturalHeight],
]);

export const imageAspectRatio = (image: HTMLImageElement): number | undefined => {
  const width = Number(image.getAttribute('width'));
  const height = Number(image.getAttribute('height'));
  if (dimension(width) && dimension(height)) return width / height;
  if (Number.isFinite(image.naturalWidth) && image.naturalWidth > 0 && Number.isFinite(image.naturalHeight) && image.naturalHeight > 0)
    return image.naturalWidth / image.naturalHeight;
};

export const proportionalDimensions = (size: ImageResize, ratio: number | undefined): Required<Pick<ImageValue, 'width' | 'height'>> => {
  if (!size || typeof size !== 'object' || Array.isArray(size)) throw new TypeError('Expected one image dimension.');
  const keys = Reflect.ownKeys(size);
  if (keys.length !== 1 || (keys[0] !== 'width' && keys[0] !== 'height')) throw new TypeError('Provide exactly one image width or height.');
  const axis = keys[0];
  const requested = size[axis];
  if (typeof requested !== 'number' || !dimension(requested)) throw new RangeError('Image dimensions must be integers from 1 to 1000.');
  if (ratio === undefined || !Number.isFinite(ratio) || ratio <= 0) throw new RangeError('Image proportions are unavailable.');
  const width = axis === 'width' ? requested : Math.round(requested * ratio);
  const height = axis === 'height' ? requested : Math.round(requested / ratio);
  if (!dimension(width) || !dimension(height)) throw new RangeError('Proportional image dimensions must remain between 1 and 1000.');
  return { width, height };
};

export const ordinaryResizableImage = (root: HTMLElement, image: HTMLImageElement): boolean => {
  if (!root.contains(image) || image.ownerDocument !== root.ownerDocument) return false;
  for (let node: Element | null = image; node; node = node.parentElement) {
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml') return false;
    if (node === root) return true;
    if (node.hasAttribute('data-mw-node')) return false;
    if (node.localName === 'figure') {
      if (image.parentElement !== node || node.querySelectorAll('img').length !== 1
        || [...node.children].some((child) => child !== image && child.localName !== 'figcaption')
        || [...node.childNodes].some((child) => child.nodeType !== 1 && Boolean(child.textContent?.trim()))) return false;
      for (const child of node.querySelectorAll('*'))
        if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml' || child.hasAttribute('data-mw-node')) return false;
    }
  }
  return false;
};
