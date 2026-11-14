import type { ListItemBoundary } from './internal-types.js';

export type FirstBodyBackspacePlan =
  | { kind: 'join'; previous: ListItemBoundary }
  | { kind: 'unwrap'; list: HTMLElement }
  | { kind: 'lift'; list: HTMLElement; owner: HTMLLIElement; following: ChildNode[]; laterBranches: HTMLElement[] };
