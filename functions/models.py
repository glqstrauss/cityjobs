from dataclasses import dataclass
from datetime import datetime

from mashumaro.mixins.json import DataClassJSONMixin


@dataclass
class PipelineState(DataClassJSONMixin):
    """Metadata about the pipeline state."""

    source_updated_at: datetime | None  # Socrata process_date, also used as filename
    last_fetched_at: datetime | None
    last_processed_at: datetime | None
    record_count: int | None

    def raw_path(self) -> str | None:
        """Get raw file path based on source_updated_at timestamp."""
        if not self.source_updated_at:
            return None
        return f"raw/{self.source_updated_at.isoformat()}.json"

    def parquet_path(self) -> str | None:
        """Get processed file path based on source_updated_at timestamp."""
        if not self.source_updated_at:
            return None
        return f"processed/{self.source_updated_at.isoformat()}.parquet"

    @classmethod
    def empty(cls) -> "PipelineState":
        """Create an empty state for first run."""
        return cls(
            source_updated_at=None,
            last_fetched_at=None,
            last_processed_at=None,
            record_count=None,
        )
