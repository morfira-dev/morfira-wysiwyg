export interface BlockNavigationCommands {
  /** Current exact supported root-child selection; observational, never authority. */
  getSelected(): HTMLElement | undefined;
  select(target: HTMLElement): boolean;
  insertParagraph(side?: 'before' | 'after'): boolean;
}
