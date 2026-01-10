# Claude Code Guidelines

## Project Overview

NYC Jobs data pipeline hosted on GCP. Fetches job postings from NYC Open Data (Socrata), processes with DuckDB, outputs Parquet, and serves a static web UI with client-side querying via DuckDB WASM.

## Tech Stack

- **Backend**: Python on GCP Cloud Functions
- **Processing**: DuckDB (SQL-based transforms)
- **Storage**: Google Cloud Storage (raw JSON + processed Parquet)
- **Scheduling**: Cloud Scheduler
- **Frontend**: Static site on Firebase Hosting with DuckDB WASM
- **Data Source**: NYC Open Data Socrata API

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

# Deploy
gcloud functions deploy cityjobs-fetch --runtime python311 --trigger-http --source=./functions

# View logs
gcloud functions logs read cityjobs-fetch
```

## Open Questions / TODOs

Before proceeding with GCP setup, answer these:

### Authentication
- [ ] Provide GCP project ID (or choose a name)
- [ ] Confirm Socrata API credentials location (copy from `local.env` to Secret Manager)

### Service Choices
- [ ] GCS bucket name preference? (default: `cityjobs-data`)
- [ ] Cloud Function region preference? (default: `us-central1`)
- [ ] Firebase project - same as GCP project or separate?

### Processing
- [ ] Add your own Python dependencies to `requirements.txt`
- [ ] Implement SQL transforms in `functions/sql/transform.sql`
- [ ] Decide on Parquet output schema

## Migration Status

**From Cloudflare (archived in `_archive/`):**
- [x] Fetch worker logic - reference for reimplementation
- [x] Socrata client - rewrite in Python
- [x] Data shape understanding - documented in SPEC.md

**GCP Implementation:**
- [ ] Skeleton Python Cloud Function
- [ ] GCP project setup
- [ ] Cloud Storage bucket
- [ ] Secret Manager secrets
- [ ] Cloud Scheduler cron
- [ ] DuckDB processing
- [ ] Firebase Hosting for web UI
