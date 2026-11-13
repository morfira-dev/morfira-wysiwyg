export interface StatisticsOptions {
  locale?: string;
}
export interface TextStatistics {
  characters: number;
  charactersWithoutWhitespace: number;
  words: number;
}
export interface StatisticsState {
  document: TextStatistics;
  selection: TextStatistics;
}
export interface StatisticsCommands {
  getState(): StatisticsState;
  subscribe(listener: (state: StatisticsState) => void): () => void;
}
