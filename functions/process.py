"""
DuckDB processing logic.
"""

import logging
from pathlib import Path
from tempfile import TemporaryDirectory

import duckdb
from google.cloud import storage

logger = logging.getLogger(__name__)

PARQUET_FORMAT = "FORMAT PARQUET, COMPRESSION ZSTD"


def process_jobs(
    bucket: storage.Bucket, raw_path: str, processed_path: str, local_dir=None
) -> None:
    """
    Process raw JSON with DuckDB and output Parquet.
    Args:
        bucket_name: GCS bucket name
        raw_path: Path to raw JSON file in GCS (e.g., "raw/2025-01-07T06:00:00Z.json")
        processed_path: Path to output Parquet file in GCS (e.g., "processed/2025-01-07T06:05:00Z.parquet")
        local_dir: Optional local directory for temporary files (defaults to TemporaryDirectory())

    Returns:
        Path to the output Parquet file in GCS
    """
    logger.info(f"Processing {raw_path}")

    # Read from GCS
    conn = duckdb.connect()
    conn.execute("INSTALL httpfs; LOAD httpfs;")

    # Read raw JSON and transform
    # sql = open("sql/transform.sql").read()
    # result = conn.execute(sql.format(input_path=f"gs://{bucket_name}/{raw_path}"))

    conn.execute(
        f"""
    create table raw as
    from read_json('gs://{bucket.name}/{raw_path}', maximum_object_size=16777216 * 2)
    select *
    """
    )

    transform_sql = (Path(__file__).parent / "sql/transform.sql").read_text()

    with TemporaryDirectory(dir=local_dir) as tmpdir:
        # Write Parquet to GCS
        local_output_path = Path(tmpdir) / processed_path
        local_output_path.parent.mkdir(parents=True)
        logger.info(f"Applying transformation and writing to {local_output_path}")
        # Write locally first, then upload (httpfs can't write to GCS without explicit creds)
        conn.execute(
            f"COPY ({transform_sql}) TO '{local_output_path}' ({PARQUET_FORMAT})"
        )

        processed_blob = bucket.blob(processed_path)
        processed_blob.upload_from_filename(
            local_output_path, content_type="application/octet-stream"
        )
        logger.info(f"Uploaded to gs://{bucket.name}/{processed_path}")


def update_jobs_history(bucket: storage.Bucket) -> None:
    """
    Update jobs_history.parquet from all processed files.

    If jobs_history.parquet doesn't exist, creates it.
    If it exists, rebuilds it from all processed/* files.
    """
    history_blob = bucket.blob("jobs_history.parquet")
    glob_pattern = f"gs://{bucket.name}/processed/*.parquet"

    conn = duckdb.connect()
    conn.execute("INSTALL httpfs; LOAD httpfs;")

    # Columns to exclude (large text fields)
    exclude_cols = "job_description, minimum_qual_requirements, residency_requirement"

    with TemporaryDirectory() as tmpdir:
        local_output = Path(tmpdir) / "jobs_history.parquet"

        logger.info(f"Building jobs_history.parquet from {glob_pattern}")
        conn.execute(
            f"""
            COPY (
                SELECT * EXCLUDE({exclude_cols})
                FROM read_parquet('{glob_pattern}')
            ) TO '{local_output}' ({PARQUET_FORMAT})
        """
        )

        history_blob.upload_from_filename(
            local_output, content_type="application/octet-stream"
        )
        logger.info(f"Updated gs://{bucket.name}/jobs_history.parquet")


def rebuild_jobs_history(bucket: storage.Bucket) -> None:
    """Rebuild jobs_history.parquet from scratch."""
    history_blob = bucket.blob("jobs_history.parquet")
    if history_blob.exists():
        history_blob.delete()
        logger.info("Deleted existing jobs_history.parquet")

    update_jobs_history(bucket)


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    # gs://cityjobs-data/raw/2026-01-10T16:42:21.342308+00:00.json
    process_jobs(
        storage.Client().bucket("cityjobs-data"),
        "raw/2026-01-10T16:42:21.342308+00:00.json",
        "processed/2026-01-10T16:43:21.342308+00:00.parquet",
        local_dir=Path(__file__).parent.parent / "local",
    )
