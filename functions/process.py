"""
DuckDB processing logic.

TODO: Implement your own transformations here.
"""

import json
import logging
from pathlib import Path

import duckdb
from google.cloud import storage

logger = logging.getLogger(__name__)


def process_jobs(bucket_name: str, raw_path: str) -> str:
    """
    Process raw JSON with DuckDB and output Parquet.
    Args:
        bucket_name: GCS bucket name
        raw_path: Path to raw JSON file in GCS (e.g., "raw/2025-01-07T06:00:00Z.json")

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
    from read_json('gs://{bucket_name}/{raw_path}', maximum_object_size=16777216 * 2)
    select unnest(data, max_depth := 2)
    """
    )

    transform_sql = (Path(__file__).parent / "sql/transform.sql").read_text()

    # Write Parquet to GCS
    output_path = f"processed/{Path(raw_path).stem}.parquet"
    logger.info(f"Applying transformation and writing to {output_path}")

    # Write locally first, then upload (httpfs can't write to GCS without explicit creds)
    local_output = Path(__file__).parent.parent / "local" / "output.parquet"
    local_output.parent.mkdir(parents=True, exist_ok=True)

    conn.execute(f"COPY ({transform_sql}) TO '{local_output}' (FORMAT PARQUET)")

    # Upload to GCS
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(output_path)
    blob.upload_from_filename(
        str(local_output), content_type="application/octet-stream"
    )
    logger.info(f"Uploaded to gs://{bucket_name}/{output_path}")

    # Update metadata.json with processedPath
    metadata_blob = bucket.blob("metadata.json")
    metadata = json.loads(metadata_blob.download_as_string())
    metadata["processedPath"] = output_path
    metadata_blob.upload_from_string(
        json.dumps(metadata, indent=2), content_type="application/json"
    )
    logger.info("Updated metadata.json with processedPath")

    return output_path


if __name__ == "__main__":
    import logging

    logging.basicConfig(level=logging.INFO)
    # gs://cityjobs-data/raw/2026-01-10T16:42:21.342308+00:00.json
    process_jobs("cityjobs-data", "raw/2026-01-10T16:42:21.342308+00:00.json")
