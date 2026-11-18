export interface FormSelection {
  capture(): void;
  restore(acceptFocus?: () => boolean, stageBeforeFocus?: boolean): boolean;
  peek(): Range | undefined;
  destroy(): void;
}

export interface FormInputElements {
  label: HTMLLabelElement;
  caption: HTMLSpanElement;
  input: HTMLInputElement;
}
