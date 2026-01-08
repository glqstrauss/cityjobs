import type { Env, SnapshotMetadata } from "./types";
import type { SocrataJob } from "./lib/socrata";
import { transformJobs, ProcessedJob } from "./lib/transform";

const RAW_METADATA_KEY = "snapshots/latest-metadata.json";
const RAW_SNAPSHOTS_PREFIX = "snapshots/raw/";
const PROCESSED_SNAPSHOTS_PREFIX = "snapshots/processed/";
const PROCESSED_METADATA_KEY = "snapshots/processed-metadata.json";

interface RawSnapshot {
  metadata: SnapshotMetadata;
  data: SocrataJob[];
}

interface ProcessedSnapshot {
  metadata: ProcessedSnapshotMetadata;
  data: ProcessedJob[];
}

interface ProcessedSnapshotMetadata {
  sourceSnapshot: string;
  processedAt: string;
  recordCount: number;
}

export async function handleProcess(env: Env): Promise<void> {
  // Get latest raw snapshot metadata
  const rawMetadata = await getLatestRawMetadata(env);
  if (!rawMetadata) {
    console.log("No raw snapshots found, skipping processing");
    return;
  }

  // Check if we've already processed this snapshot
  const processedMetadata = await getProcessedMetadata(env);
  if (processedMetadata && processedMetadata.sourceSnapshot === rawMetadata.fetchedAt) {
    console.log("Latest snapshot already processed, skipping");
    return;
  }

  // Read the raw snapshot
  console.log(`Reading raw snapshot from ${rawMetadata.fetchedAt}`);
  const rawSnapshot = await readRawSnapshot(env, rawMetadata.fetchedAt);
  if (!rawSnapshot) {
    throw new Error(`Failed to read raw snapshot: ${rawMetadata.fetchedAt}`);
  }

  console.log(`Processing ${rawSnapshot.data.length} records...`);

  // Transform the data
  const processedJobs = transformJobs(rawSnapshot.data);

  // Store processed snapshot
  const now = new Date().toISOString();
  const processedSnapshotKey = `${PROCESSED_SNAPSHOTS_PREFIX}${now}.json`;

  const processedSnapshot: ProcessedSnapshot = {
    metadata: {
      sourceSnapshot: rawMetadata.fetchedAt,
      processedAt: now,
      recordCount: processedJobs.length,
    },
    data: processedJobs,
  };

  console.log(`Storing processed snapshot to R2: ${processedSnapshotKey}`);
  await env.R2_BUCKET.put(processedSnapshotKey, JSON.stringify(processedSnapshot), {
    httpMetadata: { contentType: "application/json" },
  });

  // Update processed metadata pointer
  await env.R2_BUCKET.put(
    PROCESSED_METADATA_KEY,
    JSON.stringify(processedSnapshot.metadata),
    { httpMetadata: { contentType: "application/json" } }
  );

  console.log(`Processing complete: ${processedJobs.length} records`);

  // TODO: Write to D1 database
  // await writeToD1(env, processedJobs);
}

async function getLatestRawMetadata(env: Env): Promise<SnapshotMetadata | null> {
  const object = await env.R2_BUCKET.get(RAW_METADATA_KEY);
  if (!object) return null;
  return object.json();
}

async function getProcessedMetadata(env: Env): Promise<ProcessedSnapshotMetadata | null> {
  const object = await env.R2_BUCKET.get(PROCESSED_METADATA_KEY);
  if (!object) return null;
  return object.json();
}

async function readRawSnapshot(env: Env, fetchedAt: string): Promise<RawSnapshot | null> {
  const key = `${RAW_SNAPSHOTS_PREFIX}${fetchedAt}.json`;
  const object = await env.R2_BUCKET.get(key);
  if (!object) return null;
  return object.json();
}
