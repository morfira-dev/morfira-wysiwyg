export type MediaProvider = 'youtube' | 'vimeo';
export interface MediaReference {
  readonly provider: MediaProvider;
  readonly id: string;
  readonly url: string;
}
export interface MediaValue {
  readonly url: string;
  readonly title?: string;
}
export interface MediaDescriptor extends MediaReference {
  readonly title: string;
}
export interface MediaCommands {
  insert(value: MediaValue): boolean;
  update(target: HTMLElement, value: MediaValue): boolean;
  remove(target: HTMLElement): boolean;
  get(target: HTMLElement): MediaDescriptor | undefined;
}
