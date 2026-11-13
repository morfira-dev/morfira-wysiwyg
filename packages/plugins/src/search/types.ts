export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}
export interface SearchMatch {
  index: number;
  length: number;
  text: string;
}
export interface SearchState {
  query: string;
  options: {
    caseSensitive: boolean;
    wholeWord: boolean;
  };
  matches: SearchMatch[];
  current: number;
  error?: 'match-limit';
}
export interface SearchCommands {
  setQuery(query: string, options?: SearchOptions): void;
  getState(): SearchState;
  select(index: number): void;
  next(): SearchMatch | undefined;
  previous(): SearchMatch | undefined;
  replaceCurrent(replacement: string): boolean;
  replaceAll(replacement: string): number;
  clear(): void;
  subscribe(listener: (state: SearchState) => void): () => void;
}
export interface Leaf {
  node: Text;
  start: number;
  end: number;
}
export interface Run {
  text: string;
  start: number;
  leaves: Leaf[];
}
export interface LocatedMatch extends SearchMatch {
  run: number;
  first: number;
  last: number;
}
export interface Index {
  runs: Run[];
  matches: LocatedMatch[];
}
