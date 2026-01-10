import { SocrataClient } from "./lib/socrata";
import { handleProcess } from "./process";
import type { Env, SnapshotMetadata } from "./types";

const SNAPSHOTS_PREFIX = "snapshots/raw/";
const METADATA_KEY = "snapshots/latest-metadata.json";

export async function handleScheduled(env: Env): Promise<void> {
  const client = new SocrataClient({
    baseUrl: env.SOCRATA_BASE_URL,
    datasetId: env.SOCRATA_DATASET_ID,
    appKeyId: env.SOCRATA_APP_KEY_ID,
    appKeySecret: env.SOCRATA_APP_KEY_SECRET,
  });

  // Get dataset metadata to check last update time
  console.log("Fetching dataset metadata...");
  const metadata = await client.getMetadata();
  const dataUpdatedAt = metadata.dataUpdatedAt;
  console.log(`Dataset last updated: ${dataUpdatedAt}`);

  // Check if we already have this version
  const lastMetadata = await getLastSnapshotMetadata(env);
  if (lastMetadata && lastMetadata.dataUpdatedAt === dataUpdatedAt) {
    console.log("No new data since last snapshot, skipping fetch");
    return;
  }

  // Fetch all data
  console.log("Fetching all job postings...");
  const jobs = await client.fetchAllData();
  console.log(`Fetched ${jobs.length} job postings`);

  // Store raw snapshot in R2
  const now = new Date().toISOString();
  const snapshotKey = `${SNAPSHOTS_PREFIX}${now}.json`;

  const snapshotData = {
    metadata: {
      dataUpdatedAt,
      fetchedAt: now,
      recordCount: jobs.length,
    },
    data: jobs,
  };

  console.log(`Storing snapshot to R2: ${snapshotKey}`);
  await env.R2_BUCKET.put(snapshotKey, JSON.stringify(snapshotData), {
    httpMetadata: { contentType: "application/json" },
  });

  // Update latest metadata pointer
  const latestMetadata: SnapshotMetadata = {
    dataUpdatedAt,
    fetchedAt: now,
    recordCount: jobs.length,
  };
  await env.R2_BUCKET.put(METADATA_KEY, JSON.stringify(latestMetadata), {
    httpMetadata: { contentType: "application/json" },
  });

  console.log("Snapshot stored successfully");

  // Process the data
  await handleProcess(env);
}

async function getLastSnapshotMetadata(env: Env): Promise<SnapshotMetadata | null> {
  const object = await env.R2_BUCKET.get(METADATA_KEY);
  if (!object) {
    return null;
  }
  return object.json();
}
