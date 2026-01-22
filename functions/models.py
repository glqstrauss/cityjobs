from dataclasses import dataclass
from datetime import datetime

from mashumaro.mixins.json import DataClassJSONMixin


@dataclass
class JobState(DataClassJSONMixin):
    """Metadata about the job dataset."""

    snapshot_path: str | None
    processed_path: str | None
    record_count: int | None
    source_updated_at: datetime | None
    snapshot_fetched_at: datetime | None
    snapshot_processed_at: datetime | None

    @classmethod
    def empty(cls) -> "JobState":
        """Create an empty job state for first run."""
        return cls(
            snapshot_path=None,
            processed_path=None,
            record_count=None,
            source_updated_at=None,
            snapshot_fetched_at=None,
            snapshot_processed_at=None,
        )
