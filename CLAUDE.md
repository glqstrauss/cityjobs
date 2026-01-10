# Claude Code Guidelines

## Project Overview

NYC Jobs data pipeline hosted on GCP. Fetches job postings from NYC Open Data (Socrata), processes with DuckDB, outputs Parquet, and serves a static web UI with client-side querying via DuckDB WASM.

## Tech Stack

- **Backend**: Python on GCP Cloud Functions
- **Processing**: DuckDB (SQL-based transforms)
- **Storage**: Google Cloud Storage (raw JSON + processed Parquet + static site)
- **Scheduling**: Cloud Scheduler
- **Frontend**: GCS static website hosting with DuckDB WASM
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
├── functions/                # Python Cloud Function
│   ├── main.py               # Entry point
│   ├── fetch.py              # Socrata fetch logic
│   ├── process.py            # DuckDB processing (TODO)
│   ├── pyproject.toml        # Python dependencies (UV)
│   ├── requirements.txt      # Generated from pyproject.toml
│   └── sql/
│       └── transform.sql     # DuckDB SQL transforms (TODO)
├── web/                      # Static frontend (TODO)
│   ├── index.html
│   ├── app.ts                # DuckDB WASM queries
│   └── style.css
├── cors.json                 # GCS CORS configuration
├── SPEC.md                   # Architecture and decisions
├── CLAUDE.md                 # This file
└── local.env                 # Local secrets (gitignored)
```

## Conventions

### Code Style (Python)

- Python 3.11+
- Type hints for function signatures
- Use `logging` module, not print statements

### Code Style (TypeScript - web only)

- TypeScript strict mode
- Minimal dependencies

### Commits

- Commit completed features/fixes, not WIP
- Use conventional commit style: `feat:`, `fix:`, `chore:`, etc.

### Configuration

- Secrets in GCP Secret Manager (production) or `local.env` (development)
- Non-secret config as environment variables
- Do not hardcode config values in source files

## Local Development

```bash
# Setup (using UV)
cd functions
uv venv
uv pip install -e ".[dev]"

# Run locally
source .venv/bin/activate
python main.py                          # Requires ../local.env
functions-framework --target=main       # Run with Functions Framework
```

## Maintenance Operations

### Regenerate requirements.txt from pyproject.toml

Cloud Functions requires `requirements.txt`. After updating `pyproject.toml`:

```bash
cd functions
uv pip compile pyproject.toml -o requirements.txt
```

### Redeploy Cloud Function

After code changes:

```bash
gcloud functions deploy cityjobs-fetch \
  --gen2 --runtime python311 --region us-east1 \
  --trigger-http --no-allow-unauthenticated \
  --entry-point main --source ./functions \
  --set-env-vars GCS_BUCKET=cityjobs-data,GCP_PROJECT=city-jobs-483916 \
  --set-secrets 'SOCRATA_APP_KEY_ID=SOCRATA_APP_KEY_ID:latest,SOCRATA_APP_KEY_SECRET=SOCRATA_APP_KEY_SECRET:latest'
```

### Update Cloud Scheduler

Change schedule or other settings:

```bash
# Update schedule (e.g., to 5am UTC)
gcloud scheduler jobs update http cityjobs-daily \
  --location us-east1 \
  --schedule "0 5 * * *"

# Pause the schedule
gcloud scheduler jobs pause cityjobs-daily --location us-east1

# Resume the schedule
gcloud scheduler jobs resume cityjobs-daily --location us-east1
```

### Manually Trigger Fetch

The function is protected (not publicly accessible). Use the scheduler to trigger:

```bash
gcloud scheduler jobs run cityjobs-daily --location us-east1
```

### View Logs

```bash
# Recent function logs
gcloud functions logs read cityjobs-fetch --region us-east1 --limit 50

# Detailed Cloud Run logs (includes HTTP request info)
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=cityjobs-fetch" --limit 20
```

### Check GCS Data

```bash
# View bucket contents
gsutil ls gs://cityjobs-data/
gsutil ls gs://cityjobs-data/raw/

# View metadata
gsutil cat gs://cityjobs-data/metadata.json

# Download a snapshot
gsutil cp gs://cityjobs-data/raw/FILENAME.json ./local-copy.json
```

### Update Secrets

```bash
# Create new version of a secret
echo -n "new-value" | gcloud secrets versions add SOCRATA_APP_KEY_ID --data-file=-

# Function will automatically use latest version on next cold start
# Force restart by redeploying or waiting for instance to scale down
```

### Update CORS Configuration

After editing `cors.json`:

```bash
gsutil cors set cors.json gs://cityjobs-data
```

## TODOs (User)

- [ ] Add DuckDB/PyArrow dependencies to `pyproject.toml`
- [ ] Implement `process.py` with DuckDB logic
- [ ] Write SQL transforms in `sql/transform.sql`
- [ ] Build web UI with DuckDB WASM

## Migration Status

**From Cloudflare (archived in `_archive/`):**

- [x] Fetch worker logic - reference for reimplementation
- [x] Socrata client - rewritten in Python
- [x] Data shape understanding - documented in SPEC.md

**GCP Implementation:**

- [x] Skeleton Python Cloud Function
- [x] GCP project setup (APIs enabled)
- [x] Cloud Storage bucket (public read, CORS)
- [x] Secret Manager secrets
- [x] Deploy Cloud Function (protected)
- [x] Cloud Scheduler cron (4am UTC, authenticated)
- [ ] DuckDB processing (user implements)
- [ ] GCS static site hosting (user implements)
