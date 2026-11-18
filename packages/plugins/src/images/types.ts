export interface ImageValue {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  caption?: string;
}
export type ImagePatch = Partial<Omit<ImageValue, 'width' | 'height'>> & {
  width?: number | null;
  height?: number | null;
};
export type ImageResize = { width: number; height?: never } | { height: number; width?: never };
export interface ImageOptions {
  upload?: (file: File, context: {
    signal: AbortSignal;
  }) => Promise<ImageValue>;
  maxFileSize?: number;
}
export interface ImageUploadOptions {
  signal?: AbortSignal;
}
export interface ImageCommands {
  insert(value: ImageValue): void;
  select(image: HTMLImageElement): void;
  getSelected(): ImageValue | undefined;
  update(value: ImagePatch): void;
  resize(size: ImageResize): void;
  remove(): void;
  upload(file: File, options?: ImageUploadOptions): Promise<boolean>;
  cancelUpload(): void;
  isUploading(): boolean;
}
