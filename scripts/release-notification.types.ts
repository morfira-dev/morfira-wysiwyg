export interface PublishedPackage {
  readonly name: string;
  readonly version: string;
}
export interface PublishedReleaseReport {
  readonly version: 1;
  readonly sourceSha: string;
  readonly runId: string;
  readonly runAttempt: string;
  readonly packages: readonly PublishedPackage[];
}
