import type { ImageAlignment } from './types.js';

export const checkImageAlignment = (value: unknown): void => {
  if (value !== false && value !== 'left' && value !== 'center' && value !== 'right')
    throw new TypeError('Image alignment must be left, center, right or false.');
};

export const readImageAlignment = (image: HTMLImageElement): ImageAlignment | undefined => {
  if (image.style.display !== 'block') return;
  const left = image.style.marginLeft;
  const right = image.style.marginRight;
  if (left === '0px' && right === 'auto') return 'left';
  if (left === 'auto' && right === 'auto') return 'center';
  if (left === 'auto' && right === '0px') return 'right';
};

export const writeImageAlignment = (image: HTMLImageElement, alignment: ImageAlignment | false): void => {
  if (alignment === false) {
    image.style.removeProperty('display');
    image.style.removeProperty('margin-left');
    image.style.removeProperty('margin-right');
  }
  else {
    image.style.display = 'block';
    image.style.marginLeft = alignment === 'left' ? '0px' : 'auto';
    image.style.marginRight = alignment === 'right' ? '0px' : 'auto';
  }
  if (!image.style.cssText) image.removeAttribute('style');
};
