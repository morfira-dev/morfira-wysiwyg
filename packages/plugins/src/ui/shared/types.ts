export interface FormSelection {
  capture(): void;
  restore(): boolean;
  peek(): Range | undefined;
  destroy(): void;
}

export interface FormInputElements {
  label: HTMLLabelElement;
  caption: HTMLSpanElement;
  input: HTMLInputElement;
}
