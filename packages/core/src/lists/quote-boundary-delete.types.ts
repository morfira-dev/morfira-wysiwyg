export interface ListQuoteDeletePlan {
  readonly left: HTMLElement;
  readonly right: HTMLElement;
  readonly rightQuote?: HTMLElement;
}
export type ListQuoteDeleteInspection = ListQuoteDeletePlan | 'blocked' | undefined;
