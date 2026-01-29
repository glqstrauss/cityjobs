#!/bin/bash
#
# One-time migration: rename raw files to use Socrata process_date as filename
#
set -e

BUCKET="gs://cityjobs-data"

echo "=== Migration: Rename raw files to use process_date ==="
echo ""

# Get list of raw files (handle spaces in filenames)
gsutil ls "$BUCKET/raw/" | while read -r RAW_FILE; do
    # Extract process_date from the file
    PROCESS_DATE=$(gsutil cat "$RAW_FILE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
pd = data[0].get('process_date', '')
# Convert to ISO format suitable for filename: 2026-01-20T00:00:00.000 -> 2026-01-20T00:00:00+00:00
if pd:
    # Remove milliseconds and add timezone
    pd = pd.split('.')[0] + '+00:00'
print(pd)
")

    if [ -z "$PROCESS_DATE" ]; then
        echo "SKIP: $RAW_FILE (no process_date)"
        continue
    fi

    NEW_NAME="$BUCKET/raw/${PROCESS_DATE}.json"

    if [ "$RAW_FILE" = "$NEW_NAME" ]; then
        echo "SKIP: $RAW_FILE (already correct)"
        continue
    fi

    # Check if target already exists
    if gsutil -q stat "$NEW_NAME" 2>/dev/null; then
        echo "DELETE: $RAW_FILE (duplicate of $NEW_NAME)"
        gsutil rm "$RAW_FILE"
    else
        echo "RENAME: $RAW_FILE -> $NEW_NAME"
        gsutil mv "$RAW_FILE" "$NEW_NAME"
    fi
done

echo ""
echo "=== Delete all processed files (will be regenerated) ==="
gsutil rm "$BUCKET/processed/*" 2>/dev/null || echo "No processed files to delete"

echo ""
echo "=== Done! Now run: ./scripts/trigger.sh reprocess ==="
