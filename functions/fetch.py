"""
Socrata API client and fetch logic.

Fetches NYC Jobs data and stores raw JSON snapshots in GCS.
"""

import json
import logging
import os
from datetime import datetime, timezone

import requests
from google.cloud import secretmanager, storage

logger = logging.getLogger(__name__)

# Socrata API configuration
SOCRATA_BASE_URL = "https://data.cityofnewyork.us"
DATASET_ID = "kpav-sd4t"
PAGE_SIZE = 10000


def get_secret(secret_id: str) -> str:
    """Retrieve secret from GCP Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    project_id = os.environ.get("GCP_PROJECT")
    name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")


def get_socrata_auth() -> tuple[str, str] | None:
    """Get Socrata API credentials from environment or Secret Manager."""
    # Try environment first (local dev)
    key_id = os.environ.get("SOCRATA_APP_KEY_ID")
    key_secret = os.environ.get("SOCRATA_APP_KEY_SECRET")

    if key_id and key_secret:
        return (key_id, key_secret)

    # Try Secret Manager (production)
    try:
        key_id = get_secret("SOCRATA_APP_KEY_ID")
        key_secret = get_secret("SOCRATA_APP_KEY_SECRET")
        return (key_id, key_secret)
    except Exception as e:
        logger.warning(f"Could not get secrets: {e}")
        return None


def get_dataset_metadata() -> dict:
    """Fetch dataset metadata from Socrata."""
    url = f"{SOCRATA_BASE_URL}/api/views/metadata/v1/{DATASET_ID}"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()


def fetch_all_jobs(auth: tuple[str, str] | None) -> list[dict]:
    """Fetch all job records from Socrata with pagination."""
    all_records = []
    offset = 0

    while True:
        url = f"{SOCRATA_BASE_URL}/resource/{DATASET_ID}.json"
        params = {"$limit": PAGE_SIZE, "$offset": offset}

        if auth:
            response = requests.get(url, params=params, auth=auth)
        else:
            response = requests.get(url, params=params)

        response.raise_for_status()
        batch = response.json()

        all_records.extend(batch)
        logger.info(f"Fetched {len(batch)} records (total: {len(all_records)})")

        if len(batch) < PAGE_SIZE:
            break

        offset += PAGE_SIZE

    return all_records


def get_last_metadata(bucket: storage.Bucket) -> dict | None:
    """Get metadata from last fetch."""
    blob = bucket.blob("metadata.json")
    if not blob.exists():
        return None

    return json.loads(blob.download_as_text())


def fetch_jobs(bucket_name: str) -> str | None:
    """
    Fetch jobs from Socrata and store in GCS.

    Returns the GCS path of the raw JSON file, or None if no new data.
    """
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)

    # Check if data has been updated
    logger.info("Checking dataset metadata...")
    metadata = get_dataset_metadata()
    data_updated_at = metadata.get("dataUpdatedAt")

    last_metadata = get_last_metadata(bucket)
    if last_metadata and last_metadata.get("dataUpdatedAt") == data_updated_at:
        logger.info(f"No new data since {data_updated_at}")
        return None

    # Fetch all records
    logger.info("Fetching all job records...")
    auth = get_socrata_auth()
    jobs = fetch_all_jobs(auth)
    logger.info(f"Fetched {len(jobs)} total records")

    # Store raw JSON
    now = datetime.now(timezone.utc).isoformat()
    raw_path = f"raw/{now}.json"

    raw_blob = bucket.blob(raw_path)
    raw_blob.upload_from_string(
        json.dumps({"metadata": metadata, "data": jobs}, indent=2),
        content_type="application/json",
    )
    logger.info(f"Stored raw snapshot: gs://{bucket_name}/{raw_path}")

    # Update metadata pointer
    metadata_blob = bucket.blob("metadata.json")
    metadata_blob.upload_from_string(
        json.dumps({
            "dataUpdatedAt": data_updated_at,
            "fetchedAt": now,
            "recordCount": len(jobs),
            "rawPath": raw_path,
        }),
        content_type="application/json",
    )

    return raw_path
