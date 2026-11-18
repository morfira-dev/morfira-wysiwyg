import type { ImageFormValues } from './types.js';

export interface ImageSizeLockController {
  isLocked(): boolean;
  inspect(image: HTMLImageElement | undefined, allowRefresh: boolean): void;
  validate(image: HTMLImageElement | undefined, draft: ImageFormValues): void;
  render(blocked: boolean): void;
  reset(): void;
  destroy(): void;
}
