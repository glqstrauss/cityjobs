"""
Cloud Function entry point for NYC Jobs data pipeline.

Triggered by Cloud Scheduler (daily) or HTTP request (manual).
"""

from datetime import datetime, timezone
import logging
import os

import functions_framework
from flask import Request

from fetch import fetch_jobs, get_dataset_metadata
from process import process_jobs
from models import JobState

from google.cloud import storage


logging.getLogger().setLevel(logging.INFO)
logger = logging.getLogger(__name__)


@functions_framework.http
def main(request: Request) -> tuple[str, int]:
    """
    Main entry point for the Cloud Function.

    1. Fetches job data from Socrata API
    2. Stores raw JSON in GCS
    3. Processes data with DuckDB
    4. Outputs Parquet to GCS
    """
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(os.environ.get("GCS_BUCKET", "cityjobs-data"))

        job_state = get_job_state(bucket)
        dataset_metadata = get_dataset_metadata()
        dataset_last_updated = datetime.fromisoformat(dataset_metadata["dataUpdatedAt"])
        if (
            job_state.source_updated_at
            and job_state.source_updated_at < dataset_last_updated
        ):
            logger.info("New data available since last run, fetching dataset...")
            job_state.source_updated_at = dataset_last_updated
            job_state.snapshot_fetched_at = datetime.now(timezone.utc)
            job_state.snapshot_path = f"raw/{job_state.snapshot_fetched_at}.json"
            fetch_jobs(bucket.blob(job_state.snapshot_path))
            update_job_state(bucket, job_state)

        if (
            job_state.snapshot_fetched_at
            and job_state.snapshot_path
            and (
                job_state.snapshot_processed_at is None
                or job_state.snapshot_processed_at < job_state.snapshot_fetched_at
            )
        ):
            logger.info("New snapshot fetched, processing dataset...")
            job_state.snapshot_processed_at = datetime.now(timezone.utc)
            job_state.processed_path = (
                f"processed/{job_state.snapshot_processed_at}.parquet"
            )
            process_jobs(
                bucket,
                job_state.snapshot_path,
                job_state.processed_path,
            )
            update_job_state(bucket, job_state)

        logger.info("Pipeline complete")
        return "OK", 200

    except Exception as e:
        logger.exception("Pipeline failed")
        return f"Error: {e}", 500


def get_job_state(bucket: storage.Bucket) -> JobState:
    """Retrieve the last job state from GCS."""
    metadata_blob = bucket.blob("metadata.json")
    if metadata_blob.exists():
        metadata_content = metadata_blob.download_as_text()
        logger.info(f"Last job state: {metadata_content}")
        return JobState.from_json(metadata_content)
    else:
        logger.info("No previous job state found")
        return JobState()


def update_job_state(bucket: storage.Bucket, job_state: JobState) -> None:
    """Update the job state in GCS."""
    metadata_blob = bucket.blob("metadata.json")
    metadata_blob.upload_from_string(
        job_state.to_json(indent=2),
        content_type="application/json",
    )
    logger.info("Updated job state in GCS")


# For local development
if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv("../local.env")

    # Simulate HTTP request
    class FakeRequest:
        pass

    result, status = main(FakeRequest())  # type: ignore
    print(f"Result: {result} (status {status})")
