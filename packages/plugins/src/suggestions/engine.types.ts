export type Kind = 'mentions' | 'slash';
export interface Point {
  node: Text;
  offset: number;
}
export interface Leaf {
  node: Text;
  from: number;
  to: number;
}
export interface Candidate {
  query: string;
  text: string;
  block: HTMLElement;
  start: Point;
  end: Point;
  leaves: Leaf[];
}
export interface Request {
  abort: AbortController;
  timer?: ReturnType<typeof setTimeout>;
}
