/** Internal boundary shared by the default codec and compiled extension schema. */
export type DocumentAttributeResolver = (tag: string, input: Record<string, unknown>, source: 'html' | 'json', originalTag?: string) => Record<string, string>;

export interface DocumentBudget {
  count: number;
  htmlLength: number;
}
