# Claude Code Guidelines

## Project Overview

NYC Jobs data pipeline hosted on GCP. Fetches job postings from NYC Open Data (Socrata), processes with DuckDB, outputs Parquet, and serves a static web UI with client-side querying via DuckDB WASM.

## Tech Stack

- **Backend**: Python on GCP Cloud Functions
- **Processing**: DuckDB (SQL-based transforms)
- **Storage**: Google Cloud Storage (raw JSON + processed Parquet + static site)
- **Scheduling**: Cloud Scheduler
- **Frontend**: Vanilla TypeScript + DuckDB WASM
- **Data Source**: NYC Open Data Socrata API

## GCP Configuration

- **Project ID**: `city-jobs-483916`
- **Region**: `us-east1`
- **GCS Bucket**: `cityjobs-data`
- **Cloud Function**: `cityjobs-fetch` (protected, scheduler-only)
- **Scheduler Job**: `cityjobs-daily` (4am UTC)

## Project Structure

```
cityjobs/
├── pyproject.toml            # Python dependencies (UV)
├── .pre-commit-config.yaml   # Pre-commit hooks (uv, black, sqlfmt)
├── functions/                # Python Cloud Function (deployment unit)
│   ├── main.py               # Entry point, orchestration
│   ├── models.py             # PipelineState dataclass (mashumaro)
│   ├── fetch.py              # Socrata fetch logic
│   ├── process.py            # DuckDB processing
│   ├── deploy.sh             # Deploy Cloud Function to GCP
│   ├── requirements.txt      # Generated from pyproject.toml
│   └── sql/
│       └── transform.sql     # DuckDB SQL transforms
├── web/                      # Static frontend
│   ├── deploy.sh             # Build + gzip + upload to GCS
│   ├── index.html
│   ├── src/
│   │   ├── main.ts           # Entry point
│   │   ├── db.ts             # DuckDB WASM wrapper (loads parquet from GCS)
│   │   ├── router.ts         # Hash-based SPA router
│   │   └── views/            # jobs, job-detail, faq, resources, console
│   └── style.css
├── cors.json                 # GCS CORS configuration
├── SPEC.md                   # Architecture and decisions
└── CLAUDE.md                 # This file
```

## Conventions

### Code Style (Python)

- Python 3.11+
- Type hints for function signatures
- Use `logging` module, not print statements
- Formatted with `black`

### Code Style (TypeScript)

- TypeScript strict mode
- Minimal dependencies
- Vanilla JS where possible

### Code Style (SQL)

- Formatted with `sqlfmt`
- Use `-- fmt: off` / `-- fmt: on` for blocks that shouldn't be formatted

### Commits

- Commit completed features/fixes, not WIP
- Use conventional commit style: `feat:`, `fix:`, `chore:`, etc.

### Configuration

- Secrets in GCP Secret Manager (production) or `local.env` (development)
- Non-secret config as environment variables

## Local Development

```bash
# Setup (using UV) - run from project root
uv sync

# Activate environment
source .venv/bin/activate

# Run Cloud Function locally
cd functions && python main.py

# Run pre-commit
pre-commit run --all-files
```

## Maintenance Operations

### Redeploy Cloud Function

```bash
./functions/deploy.sh
```

### Manually Trigger Fetch

```bash
gcloud scheduler jobs run cityjobs-daily --location us-east1
```

### View Logs

```bash
gcloud functions logs read cityjobs-fetch --region us-east1 --limit 50
```

### Check GCS Data

```bash
gsutil ls gs://cityjobs-data/
gsutil cat gs://cityjobs-data/metadata.json
```

### Deploy Static Site

```bash
npm run deploy
```

## Web Development

```bash
cd web
npm install      # First time setup
npm run dev      # Start dev server at http://localhost:5173
npm run build    # Build for production
```

**Stack:** Vite + TypeScript + Pico CSS + DuckDB WASM

**Structure:**

- `src/main.ts` - Entry point
- `src/db.ts` - DuckDB WASM wrapper (loads parquet from GCS, FTS index)
- `src/router.ts` - Hash-based SPA router
- `src/views/` - View components (jobs, job-detail, faq, resources, console)

## CI/CD

GitHub Actions deploys automatically on push to `main`:

- **Frontend** (`.github/workflows/deploy-frontend.yml`): Triggers on `web/**` changes. Runs `web/deploy.sh`.
- **Backend** (`.github/workflows/deploy-backend.yml`): Triggers on `functions/**` changes. Runs `functions/deploy.sh`.

Auth uses [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation) (keyless, no service account JSON keys).

### GitHub Repository Variables

Set in Settings > Secrets and variables > Actions > Variables:

| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `GCS_BUCKET` | GCS bucket name |
| `GCP_REGION` | GCP region |
| `WIF_PROVIDER` | Workload Identity Provider (full resource name) |
| `WIF_SERVICE_ACCOUNT` | Service account email for GitHub Actions |
| `VITE_BUCKET_URL` | Public GCS bucket URL for frontend |

### WIF Setup (one-time)

```bash
PROJECT_ID=city-jobs-483916
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
REPO=glqstrauss/cityjobs
SA_EMAIL=github-actions@${PROJECT_ID}.iam.gserviceaccount.com

# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions" --project=$PROJECT_ID

# Grant permissions (storage + cloud functions + cloud run + SA user)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" --role="roles/storage.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" --role="roles/cloudfunctions.developer"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" --role="roles/run.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" --role="roles/iam.serviceAccountUser"

# Create Workload Identity Pool + GitHub OIDC Provider
gcloud iam workload-identity-pools create github-pool \
  --location="global" --display-name="GitHub Actions Pool" --project=$PROJECT_ID
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location="global" --workload-identity-pool="github-pool" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'" --project=$PROJECT_ID

# Allow GitHub to impersonate the SA
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}" \
  --project=$PROJECT_ID
```
