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
│   ├── models.py             # JobState dataclass (mashumaro)
│   ├── fetch.py              # Socrata fetch logic
│   ├── process.py            # DuckDB processing
│   ├── requirements.txt      # Generated from pyproject.toml
│   └── sql/
│       └── transform.sql     # DuckDB SQL transforms
├── web/                      # Static frontend
│   ├── index.html
│   ├── src/                  # TypeScript source
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
gcloud functions deploy cityjobs-fetch \
  --gen2 --runtime python311 --region us-east1 \
  --trigger-http --no-allow-unauthenticated \
  --entry-point main --source ./functions \
  --memory 1GB \
  --set-env-vars GCS_BUCKET=cityjobs-data,GCP_PROJECT=city-jobs-483916 \
  --set-secrets 'SOCRATA_APP_KEY_ID=SOCRATA_APP_KEY_ID:latest,SOCRATA_APP_KEY_SECRET=SOCRATA_APP_KEY_SECRET:latest'
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
- `src/db.ts` - DuckDB WASM wrapper (loads parquet from GCS)
- `src/router.ts` - Hash-based SPA router
- `src/views/` - View components (jobs, job-detail, faq, resources)
