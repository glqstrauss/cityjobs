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

from fetch import fetch_jobs, get_current_process_date
from process import process_jobs, update_jobs_history, rebuild_jobs_history
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

    1. Fetch 1 record to get process_date (lightweight check)
    2. Check if raw file with that process_date already exists
    3. If not, fetch full dataset and process
    """
    bucket = get_bucket()
    state = get_state(bucket)

    # Fetch 1 record to get the actual process_date
    process_date_str = get_current_process_date()
    if not process_date_str:
        log("Could not get process_date from Socrata", level="error")
        return "Error: could not get process_date", 500

    # Parse: "2026-01-26T00:00:00.000" -> "2026-01-26T00:00:00+00:00"
    process_date = datetime.fromisoformat(process_date_str.split(".")[0] + "+00:00")
    log(f"Current process_date: {process_date.isoformat()}")

    # Check if we already have this process_date
    raw_path = f"raw/{process_date.isoformat()}.json"
    raw_blob = bucket.blob(raw_path)

    if raw_blob.exists():
        log("No new data (process_date already exists)", process_date=process_date)
        return "No new data", 200

    # New data - fetch full dataset
    log(f"New process_date, fetching to {raw_path}")
    state.source_updated_at = process_date
    state.last_fetched_at = datetime.now(timezone.utc)
    fetch_jobs(raw_blob)

    # Process
    parquet_path = f"processed/{process_date.isoformat()}.parquet"
    log(f"Processing {raw_path} -> {parquet_path}")
    state.last_processed_at = datetime.now(timezone.utc)
    process_jobs(bucket, raw_path, parquet_path)

    # Update jobs_history
    log("Updating jobs_history.parquet")
    update_jobs_history(bucket)

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

    # Rebuild jobs_history from all processed files
    log("Rebuilding jobs_history.parquet")
    rebuild_jobs_history(bucket)

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
