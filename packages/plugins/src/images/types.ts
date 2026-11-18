export type ImageAlignment = 'left' | 'center' | 'right';
export interface ImageValue {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  caption?: string;
  alignment?: ImageAlignment | false;
}
export type ImagePatch = Partial<Omit<ImageValue, 'width' | 'height'>> & {
  width?: number | null;
  height?: number | null;
};
export type ImageResize = { width: number; height?: never } | { height: number; width?: never };
export interface ImageUploadProgress {
  readonly loaded: number;
  readonly total?: number;
}
export interface ImageUploadContext {
  signal: AbortSignal;
  reportProgress(progress: ImageUploadProgress): void;
}
export interface ImageOptions {
  upload?: (file: File, context: ImageUploadContext) => Promise<ImageValue>;
  maxFileSize?: number;
}
export interface ImageUploadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ImageUploadProgress) => void;
}
export interface ImageCommands {
  insert(value: ImageValue): void;
  select(image: HTMLImageElement): void;
  getSelected(): ImageValue | undefined;
  update(value: ImagePatch): void;
  resize(size: ImageResize): void;
  align(alignment: ImageAlignment | false): void;
  remove(): void;
  upload(file: File, options?: ImageUploadOptions): Promise<boolean>;
  cancelUpload(): void;
  isUploading(): boolean;
}
