"""
Cloud Function entry point for NYC Jobs data pipeline.

Triggered by Cloud Scheduler (daily) or HTTP request (manual).

Actions:
    latest (default): Fetch new data if available, then process
    reprocess_all: Delete all processed files and reprocess all raw snapshots
"""

from datetime import datetime, timezone
import json
import logging
import os
from typing import Any

import functions_framework
from flask import Request

from fetch import fetch_jobs, get_dataset_metadata
from process import process_jobs
from models import PipelineState

from google.cloud import storage


logging.getLogger().setLevel(logging.INFO)
_logger = logging.getLogger(__name__)


def log(message: str, level: str = "info", **fields: Any) -> None:
    """Log a JSON-structured message for Cloud Logging."""
    log_fn = getattr(_logger, level)
    if fields:
        for k, v in fields.items():
            if isinstance(v, datetime):
                fields[k] = v.isoformat()
        log_fn(json.dumps({"message": message, **fields}))
    else:
        log_fn(message)


def get_bucket() -> storage.Bucket:
    """Get the GCS bucket."""
    client = storage.Client()
    return client.bucket(os.environ.get("GCS_BUCKET", "cityjobs-data"))


def get_state(bucket: storage.Bucket) -> PipelineState:
    """Retrieve the pipeline state from GCS."""
    blob = bucket.blob("metadata.json")
    if blob.exists():
        return PipelineState.from_json(blob.download_as_text())
    log("No previous state found")
    return PipelineState.empty()


def update_state(bucket: storage.Bucket, state: PipelineState) -> None:
    """Update the pipeline state in GCS."""
    blob = bucket.blob("metadata.json")
    content = state.to_json()
    blob.upload_from_string(content, content_type="application/json")
    log("State updated", content=content)


@functions_framework.http
def main(request: Request) -> tuple[str, int]:
    """Route to appropriate handler based on action param."""
    action = request.args.get("action", "")
    if not action:
        try:
            body = request.get_json(silent=True) or {}
            action = body.get("action", "latest")
        except Exception:
            action = "latest"

    log("Starting pipeline", action=action)

    try:
        if action == "reprocess_all":
            return reprocess_all()
        else:
            return process_latest()
    except Exception as e:
        log("Pipeline failed", level="exception", error=str(e))
        return f"Error: {e}", 500


def process_latest() -> tuple[str, int]:
    """
    Normal operation: fetch new data if available, then process.

    1. Check Socrata metadata for dataUpdatedAt
    2. If newer than our source_updated_at:
       - Fetch raw JSON -> raw/{dataUpdatedAt}.json
       - Process -> processed/{dataUpdatedAt}.parquet
       - Update metadata.json
    3. If not newer, skip
    """
    bucket = get_bucket()
    state = get_state(bucket)

    # Check for new data
    dataset_meta = get_dataset_metadata()
    data_updated_at = datetime.fromisoformat(dataset_meta["dataUpdatedAt"])

    if state.source_updated_at and state.source_updated_at >= data_updated_at:
        log(
            "No new data available",
            source_updated_at=state.source_updated_at,
            dataset_updated_at=data_updated_at,
        )
        return "No new data", 200

    log(
        "New data available",
        source_updated_at=state.source_updated_at,
        dataset_updated_at=data_updated_at,
    )

    # Update state with new timestamp (used for filenames)
    state.source_updated_at = data_updated_at

    # Fetch raw data
    raw_path = state.raw_path()
    parquet_path = state.parquet_path()
    if not raw_path or not parquet_path:
        raise ValueError("source_updated_at must be set to generate paths")

    log(f"Fetching to {raw_path}")
    state.last_fetched_at = datetime.now(timezone.utc)
    fetch_jobs(bucket.blob(raw_path))

    # Process
    log(f"Processing {raw_path} -> {parquet_path}")
    state.last_processed_at = datetime.now(timezone.utc)
    process_jobs(bucket, raw_path, parquet_path)

    update_state(bucket, state)

    log("Pipeline complete")
    return "OK", 200


def reprocess_all() -> tuple[str, int]:
    """
    Reprocess all raw snapshots.

    1. List all files in raw/
    2. Delete all files in processed/
    3. For each raw file, process it
    4. Update metadata.json with latest
    """
    bucket = get_bucket()
    existing_state = get_state(bucket)

    # List raw files
    raw_blobs = list(bucket.list_blobs(prefix="raw/"))
    if not raw_blobs:
        log("No raw files to process")
        return "No raw files to process", 200

    log(f"Found {len(raw_blobs)} raw files to reprocess")

    # Delete all processed files
    processed_blobs = list(bucket.list_blobs(prefix="processed/"))
    for blob in processed_blobs:
        log(f"Deleting {blob.name}")
        blob.delete()
    log(f"Deleted {len(processed_blobs)} processed files")

    # Process each raw file
    latest_timestamp = None
    for raw_blob in sorted(raw_blobs, key=lambda b: b.name):
        # Extract timestamp from filename: raw/2026-01-20T20:00:31+00:00.json
        timestamp_str = raw_blob.name.replace("raw/", "").replace(".json", "")
        parquet_path = f"processed/{timestamp_str}.parquet"

        log(f"Processing {raw_blob.name} -> {parquet_path}")
        process_jobs(bucket, raw_blob.name, parquet_path)

        latest_timestamp = timestamp_str

    # Update metadata with latest
    if latest_timestamp:
        state = PipelineState(
            source_updated_at=datetime.fromisoformat(latest_timestamp),
            last_fetched_at=existing_state.last_fetched_at,
            last_processed_at=datetime.now(timezone.utc),
            record_count=None,
        )
        update_state(bucket, state)

    log(f"Reprocessed {len(raw_blobs)} files")
    return f"Reprocessed {len(raw_blobs)} files", 200


# For local development
if __name__ == "__main__":
    import sys
    from dotenv import load_dotenv

    load_dotenv("../local.env")

    class FakeRequest:
        def __init__(self, args: dict | None = None):
            self.args = args or {}

        def get_json(self, silent: bool = False) -> dict:
            return {}

    # Parse action from command line
    action = "latest"
    if len(sys.argv) > 1:
        action = sys.argv[1]

    result, status = main(FakeRequest({"action": action}))
    print(f"Result: {result} (status {status})")
