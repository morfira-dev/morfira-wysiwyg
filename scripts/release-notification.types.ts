export interface PublishedCommit {
  readonly hash: string;
  readonly label: string;
  readonly subject: string;
}
export interface PackageChanges {
  readonly changes: readonly PublishedCommit[];
  readonly changeCount: number;
}
export interface ReleaseCommit {
  readonly hash: string;
  readonly message: string;
}
export interface NotificationText {
  readonly html: string;
  readonly text: string;
}
export interface PublishedPackage {
  readonly name: string;
  readonly version: string;
  readonly changes?: readonly PublishedCommit[];
  readonly changeCount?: number;
}
export interface PublishedReleaseReport {
  readonly version: 1;
  readonly sourceSha: string;
  readonly runId: string;
  readonly runAttempt: string;
  readonly packages: readonly PublishedPackage[];
}
