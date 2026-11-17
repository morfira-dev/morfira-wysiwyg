/** Optional error presentation; upload transport is configured on images(). */
export interface ImageInputOptions {
  onError?: (error: unknown) => void | Promise<void>;
}
