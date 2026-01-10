# NYC Jobs Data Pipeline - Ops Spec

## Overview

A GCP-hosted data pipeline that:

1. Periodically downloads NYC Jobs Postings dataset snapshots
2. Stores raw data in Cloud Storage
3. Runs DuckDB-based SQL transformations
4. Outputs Parquet files for client-side querying
5. Serves a static web UI with DuckDB WASM for browsing/filtering

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Cloud Scheduler │────▶│ Cloud Function  │────▶│  Cloud Storage  │
│  (daily cron)   │     │ (fetch + process)│    │ (raw JSON)      │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 │ DuckDB transforms
                                 ▼
                        ┌─────────────────┐
                        │  Cloud Storage  │
                        │   (Parquet)     │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Cloud Storage  │
                        │ (static website │
                        │  + DuckDB WASM) │
                        └─────────────────┘
```

---

## GCP Services Used

| Service           | Purpose                              | Free Tier Limits (Always Free)     |
| ----------------- | ------------------------------------ | ---------------------------------- |
| Cloud Functions   | Fetch data + DuckDB processing       | 2M invocations/mo, 400k GB-sec     |
| Cloud Scheduler   | Daily cron trigger                   | 3 jobs                             |
| Cloud Storage     | Raw JSON + Parquet + static site     | 5GB in US regions                  |

**Note:** All limits are "always free" - no 12-month expiration.

**GCP Configuration:**
- Project ID: `city-jobs-483916`
- Region: `us-east1`
- GCS Bucket: `cityjobs-data`

---

## Data Source

**NYC Jobs Postings - NYC Open Data (Tyler/Socrata)**

- Portal: https://data.cityofnewyork.us
- Dataset: kpav-sd4t
- Data API Endpoint: https://data.cityofnewyork.us/resource/kpav-sd4t.json
- Metadata API Endpoint: https://data.cityofnewyork.us/api/views/metadata/v1/kpav-sd4t
- Documentation: https://dev.socrata.com/foundry/data.cityofnewyork.us/kpav-sd4t
- API Auth: stored in GCP Secret Manager

---

## Component Specs

### 1. Cloud Function (Fetch + Process)

**Trigger**: Cloud Scheduler (daily at 4am UTC)

**Runtime**: Python 3.11 with DuckDB

**Responsibilities**:

1. Check Socrata metadata for updates (skip if no new data)
2. Fetch all job postings from Socrata API
3. Store raw JSON snapshot in GCS
4. Run DuckDB SQL transformations
5. Export processed data as Parquet to GCS

**GCS Storage Schema**:

```
gs://cityjobs-data/
├── raw/
│   ├── 2025-01-07T06:00:00Z.json
│   └── ...
├── processed/
│   └── jobs.parquet          # Latest processed data (overwritten)
└── metadata.json             # Last update timestamps
```

**DuckDB Transformations** (SQL):

```sql
-- Example transformations (to be finalized)
SELECT
  job_id,
  agency,
  business_title,
  CAST(salary_range_from AS DOUBLE) as salary_range_from,
  CAST(salary_range_to AS DOUBLE) as salary_range_to,
  salary_frequency,
  -- Normalize to annual salary
  CASE salary_frequency
    WHEN 'Hourly' THEN CAST(salary_range_from AS DOUBLE) * 2080
    WHEN 'Daily' THEN CAST(salary_range_from AS DOUBLE) * 260
    ELSE CAST(salary_range_from AS DOUBLE)
  END as salary_annual_from,
  -- ... other columns and transforms
FROM read_json('raw/latest.json')
```

**Error Handling**:

- Cloud Functions has built-in retry on failure
- Logs to Cloud Logging
- Alert via Cloud Monitoring (optional)

---

### 2. Web Application

**Hosting**: GCS Static Website Hosting

**Query Engine**: DuckDB WASM (runs entirely in browser)

**Features**:

- Browse all job postings in paginated table
- Filter by Agency, Salary range, Job Category
- Sort by columns
- Full-text search
- View job details
- Export filtered results to CSV

**How it works**:

1. Static HTML/JS loads from GCS bucket (configured as website)
2. On page load, fetches `jobs.parquet` from same bucket
3. DuckDB WASM loads the Parquet file
4. All filtering/sorting/searching runs locally via SQL queries
5. No server-side API needed

**URL**: `https://storage.googleapis.com/cityjobs-data/index.html` (or custom domain later)

**UI Stack**: Vanilla JS + DuckDB WASM (minimal dependencies)

---

## Project Structure

```
cityjobs/
├── functions/                # Python Cloud Function
│   ├── main.py               # Entry point (HTTP handler)
│   ├── fetch.py              # Socrata fetching logic
│   ├── process.py            # DuckDB processing (TODO - user implements)
│   ├── pyproject.toml        # Python dependencies (UV)
│   └── sql/
│       └── transform.sql     # DuckDB transformation queries (TODO - user implements)
├── web/                      # Static frontend (TODO)
│   ├── index.html
│   ├── app.ts                # DuckDB WASM query logic
│   └── style.css
├── _archive/                 # Old Cloudflare TypeScript code (reference)
├── SPEC.md                   # This file
├── CLAUDE.md                 # Claude Code guidelines
└── local.env                 # Local secrets (gitignored)
```

---

## Environment Variables / Secrets

| Variable              | Description                      | Storage            |
| --------------------- | -------------------------------- | ------------------ |
| `SOCRATA_APP_KEY_ID`  | Socrata API key ID               | Secret Manager     |
| `SOCRATA_APP_KEY_SECRET` | Socrata API key secret        | Secret Manager     |
| `GCS_BUCKET`          | Cloud Storage bucket name        | Environment var    |

---

## Deployment

**One-time setup:**

```bash
# Set project
gcloud config set project city-jobs-483916

# Enable APIs
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable run.googleapis.com

# Create GCS bucket (us-east1)
gsutil mb -l us-east1 gs://cityjobs-data

# Make bucket publicly readable (for static site + data)
gsutil iam ch allUsers:objectViewer gs://cityjobs-data

# Configure CORS for browser access
gsutil cors set cors.json gs://cityjobs-data

# Store secrets
gcloud secrets create SOCRATA_APP_KEY_ID --data-file=-
gcloud secrets create SOCRATA_APP_KEY_SECRET --data-file=-

# Deploy Cloud Function (Python)
gcloud functions deploy cityjobs-fetch \
  --gen2 \
  --runtime python311 \
  --region us-east1 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point main \
  --source ./functions \
  --set-env-vars GCS_BUCKET=cityjobs-data,GCP_PROJECT=city-jobs-483916 \
  --set-secrets 'SOCRATA_APP_KEY_ID=SOCRATA_APP_KEY_ID:latest,SOCRATA_APP_KEY_SECRET=SOCRATA_APP_KEY_SECRET:latest'

# Create Cloud Scheduler job (daily at 4am UTC)
gcloud scheduler jobs create http cityjobs-daily \
  --location us-east1 \
  --schedule "0 4 * * *" \
  --uri "https://us-east1-city-jobs-483916.cloudfunctions.net/cityjobs-fetch" \
  --http-method POST
```

**Deploy static site (later):**
```bash
gsutil -m cp -r web/* gs://cityjobs-data/
```

---

## Migration from Cloudflare

**Archived (in `_archive/`):**
- TypeScript fetch worker code (reference for Python rewrite)
- Socrata client logic
- Wrangler configuration

**Migration steps:**
1. [x] Archive TypeScript codebase
2. [x] Create skeleton Python Cloud Function
3. [ ] Set up GCP project and services
4. [ ] Deploy fetch Cloud Function
5. [ ] Set up Cloud Scheduler
6. [ ] Implement DuckDB processing (user adds own transforms)
7. [ ] Build static site with DuckDB WASM
8. [ ] Deploy static site to GCS
9. [ ] Decommission Cloudflare resources (R2, Workers)

---

## Next Steps

- [x] Implement fetch worker (Cloudflare - prototype)
- [x] Understand data shape and transformation needs
- [x] Create skeleton Python Cloud Function
- [ ] Enable GCP APIs
- [ ] Create GCS bucket
- [ ] Set up secrets in Secret Manager
- [ ] Deploy fetch Cloud Function
- [ ] Set up Cloud Scheduler cron
- [ ] Test fetch pipeline end-to-end
- [ ] Implement DuckDB SQL transformations (user)
- [ ] Build static site with DuckDB WASM
- [ ] Deploy static site to GCS
- [ ] Decommission Cloudflare resources
