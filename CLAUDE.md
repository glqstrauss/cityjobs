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

## Project Structure

```
cityjobs/
├── functions/                # Python Cloud Function
│   ├── main.py               # Entry point
│   ├── fetch.py              # Socrata fetch logic
│   ├── process.py            # DuckDB processing (TODO)
│   ├── pyproject.toml        # Python dependencies (UV)
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

## Commands

```bash
# Setup (using UV)
cd functions
uv venv
uv pip install -e ".[dev]"

# Local development
source .venv/bin/activate
python main.py                          # Run locally (requires ../local.env)
functions-framework --target=main       # Run with Functions Framework

# Generate requirements.txt for Cloud Functions deploy
uv pip compile pyproject.toml -o requirements.txt

# Deploy Cloud Function
gcloud functions deploy cityjobs-fetch \
  --gen2 --runtime python311 --region us-east1 \
  --trigger-http --allow-unauthenticated \
  --entry-point main --source ./functions \
  --set-env-vars GCS_BUCKET=cityjobs-data,GCP_PROJECT=city-jobs-483916 \
  --set-secrets 'SOCRATA_APP_KEY_ID=SOCRATA_APP_KEY_ID:latest,SOCRATA_APP_KEY_SECRET=SOCRATA_APP_KEY_SECRET:latest'

# View logs
gcloud functions logs read cityjobs-fetch --region us-east1

# Trigger manually
curl https://us-east1-city-jobs-483916.cloudfunctions.net/cityjobs-fetch
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
- [ ] GCP project setup (APIs enabled)
- [ ] Cloud Storage bucket
- [ ] Secret Manager secrets
- [ ] Deploy Cloud Function
- [ ] Cloud Scheduler cron
- [ ] DuckDB processing (user implements)
- [ ] GCS static site hosting (user implements)
