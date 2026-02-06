#!/bin/bash
#
# One-time setup: Workload Identity Federation for GitHub Actions.
#
# Creates a service account, workload identity pool, and OIDC provider
# so GitHub Actions can deploy to GCP without service account keys.
#
# Prerequisites:
#   - gcloud CLI authenticated with project owner/editor
#   - APIs enabled: IAM, Security Token Service, Cloud Functions
#
set -e

# Load env from project root if available
[ -f "$(dirname "$0")/../.env" ] && set -a && source "$(dirname "$0")/../.env" && set +a

PROJECT_ID="${GCP_PROJECT:?Set GCP_PROJECT}"
REPO="${GITHUB_REPO:-glqstrauss/cityjobs}"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA_NAME="github-actions"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"

echo "Project: $PROJECT_ID (number: $PROJECT_NUMBER)"
echo "Repo: $REPO"
echo "Service Account: $SA_EMAIL"
echo ""

# 1. Enable required APIs
echo "=== Enabling APIs ==="
gcloud services enable \
  iam.googleapis.com \
  sts.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="$PROJECT_ID"

# 2. Create service account
echo "=== Creating service account ==="
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions" \
  --project="$PROJECT_ID" 2>/dev/null || echo "Service account already exists"

# 3. Grant permissions
echo "=== Granting IAM roles ==="
for role in roles/storage.admin roles/cloudfunctions.developer roles/iam.serviceAccountUser roles/run.admin; do
  echo "  $role"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --quiet > /dev/null
done

# 4. Create Workload Identity Pool
echo "=== Creating Workload Identity Pool ==="
gcloud iam workload-identity-pools create "$POOL_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project="$PROJECT_ID" 2>/dev/null || echo "Pool already exists"

# 5. Create OIDC Provider
echo "=== Creating OIDC Provider ==="
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'" \
  --project="$PROJECT_ID" 2>/dev/null || echo "Provider already exists"

# 6. Allow GitHub to impersonate the SA
echo "=== Binding Workload Identity to Service Account ==="
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}" \
  --project="$PROJECT_ID" \
  --quiet > /dev/null

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo ""
echo "=== Done! ==="
echo ""
echo "Set these as GitHub repository variables (Settings > Secrets and variables > Actions > Variables):"
echo ""
echo "  GCP_PROJECT_ID       = $PROJECT_ID"
echo "  GCS_BUCKET           = ${GCS_BUCKET:-cityjobs-data}"
echo "  GCP_REGION           = ${GCP_REGION:-us-east1}"
echo "  WIF_PROVIDER         = $WIF_PROVIDER"
echo "  WIF_SERVICE_ACCOUNT  = $SA_EMAIL"
echo "  VITE_BUCKET_URL      = ${VITE_BUCKET_URL:-https://storage.googleapis.com/${GCS_BUCKET:-cityjobs-data}}"
