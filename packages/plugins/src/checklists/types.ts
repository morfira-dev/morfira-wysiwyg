export interface ChecklistState {
  disabled: boolean;
  active: boolean;
  checked: boolean | undefined;
}

export interface ChecklistCommands {
  insert(): void;
  setChecked(checked: boolean): void;
  toggle(): void;
  remove(): void;
  getState(): ChecklistState;
}
