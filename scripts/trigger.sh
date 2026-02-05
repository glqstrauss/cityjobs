#!/bin/bash
#
# Trigger the cityjobs Cloud Function manually
#
# Usage:
#   ./scripts/trigger.sh              # Normal: fetch new data + process
#   ./scripts/trigger.sh reprocess    # Reprocess all raw snapshots
#   ./scripts/trigger.sh logs         # View recent logs
#

set -e

# Load env from project root if available
[ -f "$(dirname "$0")/../.env" ] && set -a && source "$(dirname "$0")/../.env" && set +a

FUNCTION_NAME="${CLOUD_FUNCTION_NAME:-cityjobs-fetch}"
REGION="${GCP_REGION:-us-east1}"
PROJECT="${GCP_PROJECT:?Set GCP_PROJECT in .env}"

case "${1:-latest}" in
  latest|run)
    echo "Triggering $FUNCTION_NAME (action=latest)..."
    gcloud functions call $FUNCTION_NAME \
      --region $REGION \
      --project $PROJECT \
      --data '{"action": "latest"}'
    ;;

  reprocess)
    echo "Triggering $FUNCTION_NAME (action=reprocess_all)..."
    echo "This will delete all processed files and reprocess all raw snapshots."
    read -p "Continue? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      gcloud functions call $FUNCTION_NAME \
        --region $REGION \
        --project $PROJECT \
        --data '{"action": "reprocess_all"}'
    else
      echo "Aborted."
      exit 1
    fi
    ;;

  logs)
    echo "Recent logs for $FUNCTION_NAME:"
    gcloud functions logs read $FUNCTION_NAME \
      --region $REGION \
      --project $PROJECT \
      --limit 50
    ;;

  *)
    echo "Usage: $0 [latest|reprocess|logs]"
    echo ""
    echo "Commands:"
    echo "  latest     Fetch new data if available, then process (default)"
    echo "  reprocess  Delete all processed files and reprocess all raw snapshots"
    echo "  logs       View recent logs"
    exit 1
    ;;
esac
