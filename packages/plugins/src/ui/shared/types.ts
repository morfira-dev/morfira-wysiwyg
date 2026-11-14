export interface FormSelection {
  capture(): void;
  restore(): boolean;
  peek(): Range | undefined;
  destroy(): void;
}
