import type { ImageResize, ImageValue } from './types.js';
import { imageFigure, ordinaryImageAncestors, ordinaryImageDescendants } from './figure.js';

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
  return ordinaryImageAncestors(root, image, (figure) => imageFigure(image, figure) === figure && ordinaryImageDescendants(figure));
};
