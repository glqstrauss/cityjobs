export interface Env {
  R2_BUCKET: R2Bucket;
  D1_DATABASE: D1Database;
  SOCRATA_BASE_URL: string;
  SOCRATA_DATASET_ID: string;
  SOCRATA_APP_KEY_ID?: string;
  SOCRATA_APP_KEY_SECRET?: string;
}

export interface SnapshotMetadata {
  dataUpdatedAt: string;
  fetchedAt: string;
  recordCount: number;
}
