#!/bin/bash
#
# Deploy the Cloud Function to GCP.
#
# Reads config from environment variables (or .env at project root).
#
set -e

# Load env from project root if available (local dev)
[ -f "$(dirname "$0")/../.env" ] && set -a && source "$(dirname "$0")/../.env" && set +a

PROJECT="${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${GCP_REGION:-us-east1}"
BUCKET="${GCS_BUCKET:?Set GCS_BUCKET}"
FUNCTION_NAME="${CLOUD_FUNCTION_NAME:-cityjobs-fetch}"

gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 --runtime python311 --region "$REGION" \
  --project "$PROJECT" \
  --trigger-http --no-allow-unauthenticated \
  --entry-point main --source ./functions \
  --memory 1GB \
  --set-env-vars "GCS_BUCKET=${BUCKET},GCP_PROJECT=${PROJECT}" \
  --set-secrets 'SOCRATA_APP_KEY_ID=SOCRATA_APP_KEY_ID:latest,SOCRATA_APP_KEY_SECRET=SOCRATA_APP_KEY_SECRET:latest'
