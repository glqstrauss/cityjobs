from datetime import datetime

from dataclasses import dataclass
from typing import Annotated
from mashumaro.mixins.json import DataClassJSONMixin

from mashumaro.types import Alias


@dataclass
class JobState(DataClassJSONMixin):
    """Metadata about the job dataset."""

    snapshot_path: Annotated[str | None, Alias("snapshotPath")] = None
    processed_path: Annotated[str | None, Alias("processedPath")] = None
    record_count: Annotated[int | None, Alias("recordCount")] = None
    source_updated_at: Annotated[datetime | None, Alias("dataUpdatedAt")] = None
    snapshot_fetched_at: Annotated[datetime | None, Alias("snapshotFetchedAt")] = None
    snapshot_processed_at: Annotated[datetime | None, Alias("snapshotProcessedAt")] = (
        None
    )
