export interface PrintSession {
  readonly surface: HTMLElement;
  readonly body: HTMLElement;
  readonly marker: string;
  enteredMedia: boolean;
}
