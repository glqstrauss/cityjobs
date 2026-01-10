"""
Cloud Function entry point for NYC Jobs data pipeline.

Triggered by Cloud Scheduler (daily) or HTTP request (manual).
"""

import logging
import os

import functions_framework
from flask import Request

from fetch import fetch_jobs
from process import process_jobs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@functions_framework.http
def main(request: Request) -> tuple[str, int]:
    """
    Main entry point for the Cloud Function.

    1. Fetches job data from Socrata API
    2. Stores raw JSON in GCS
    3. Processes data with DuckDB (TODO)
    4. Outputs Parquet to GCS (TODO)
    """
    try:
        bucket_name = os.environ.get("GCS_BUCKET", "cityjobs-data")

        # Fetch from Socrata and store raw JSON
        logger.info("Starting fetch...")
        raw_path = fetch_jobs(bucket_name)

        if raw_path is None:
            logger.info("No new data, skipping processing")
            return "No new data", 200

        # Process with DuckDB and output Parquet
        logger.info("Starting processing...")
        process_jobs(bucket_name, raw_path)

        logger.info("Pipeline complete")
        return "OK", 200

    except Exception as e:
        logger.exception("Pipeline failed")
        return f"Error: {e}", 500


# For local development
if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv("../local.env")

    # Simulate HTTP request
    class FakeRequest:
        pass

    result, status = main(FakeRequest())
    print(f"Result: {result} (status {status})")
