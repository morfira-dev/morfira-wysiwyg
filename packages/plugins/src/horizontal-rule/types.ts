export interface HorizontalRuleState {
  disabled: boolean;
}

export interface HorizontalRuleCommands {
  insert(): void;
  getState(range?: Range): HorizontalRuleState;
}
