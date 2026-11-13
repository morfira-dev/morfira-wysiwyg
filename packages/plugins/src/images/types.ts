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
export interface ImageOptions {
  upload?: (file: File, context: {
    signal: AbortSignal;
  }) => Promise<ImageValue>;
  maxFileSize?: number;
}
export interface ImageCommands {
  insert(value: ImageValue): void;
  select(image: HTMLImageElement): void;
  getSelected(): ImageValue | undefined;
  update(value: ImagePatch): void;
  remove(): void;
  upload(file: File): Promise<boolean>;
  cancelUpload(): void;
  isUploading(): boolean;
}
