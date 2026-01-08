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
                        │ Firebase Hosting│
                        │ (static site +  │
                        │  DuckDB WASM)   │
                        └─────────────────┘
```

---

## GCP Services Used

| Service           | Purpose                              | Free Tier Limits (Always Free)     |
| ----------------- | ------------------------------------ | ---------------------------------- |
| Cloud Functions   | Fetch data + DuckDB processing       | 2M invocations/mo, 400k GB-sec     |
| Cloud Scheduler   | Daily cron trigger                   | 3 jobs                             |
| Cloud Storage     | Raw JSON + processed Parquet         | 5GB in US regions                  |
| Firebase Hosting  | Static site with DuckDB WASM         | 10GB storage, 360MB/day transfer   |

**Note:** All limits are "always free" - no 12-month expiration.

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

**Runtime**: Node.js 20 with DuckDB

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

**Hosting**: Firebase Hosting (static files)

**Query Engine**: DuckDB WASM (runs entirely in browser)

**Features**:

- Browse all job postings in paginated table
- Filter by Agency, Salary range, Job Category
- Sort by columns
- Full-text search
- View job details
- Export filtered results to CSV

**How it works**:

1. Static HTML/JS loads from Firebase Hosting
2. On page load, fetches `jobs.parquet` from GCS (via public URL or Firebase)
3. DuckDB WASM loads the Parquet file
4. All filtering/sorting/searching runs locally via SQL queries
5. No server-side API needed

**UI Stack**: Vanilla JS + DuckDB WASM (minimal dependencies)

---

## Project Structure (Proposed)

```
cityjobs/
├── functions/
│   ├── src/
│   │   ├── index.ts          # Cloud Function entry point
│   │   ├── fetch.ts          # Socrata fetching logic
│   │   ├── process.ts        # DuckDB processing
│   │   └── lib/
│   │       └── socrata.ts    # Socrata API client
│   ├── sql/
│   │   └── transform.sql     # DuckDB transformation queries
│   ├── package.json
│   └── tsconfig.json
├── web/
│   ├── index.html
│   ├── app.js                # DuckDB WASM query logic
│   └── style.css
├── firebase.json             # Firebase Hosting config
└── README.md
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
# Create GCP project
gcloud projects create cityjobs --name="NYC Jobs Pipeline"
gcloud config set project cityjobs

# Enable APIs
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Create GCS bucket
gsutil mb -l us-central1 gs://cityjobs-data

# Store secrets
echo -n "your-key-id" | gcloud secrets create SOCRATA_APP_KEY_ID --data-file=-
echo -n "your-key-secret" | gcloud secrets create SOCRATA_APP_KEY_SECRET --data-file=-

# Deploy Cloud Function
gcloud functions deploy cityjobs-fetch \
  --runtime nodejs20 \
  --trigger-http \
  --entry-point main \
  --source ./functions \
  --set-secrets 'SOCRATA_APP_KEY_ID=SOCRATA_APP_KEY_ID:latest,SOCRATA_APP_KEY_SECRET=SOCRATA_APP_KEY_SECRET:latest'

# Create Cloud Scheduler job
gcloud scheduler jobs create http cityjobs-daily \
  --schedule "0 4 * * *" \
  --uri "https://REGION-PROJECT.cloudfunctions.net/cityjobs-fetch" \
  --http-method POST

# Initialize Firebase and deploy web app
firebase init hosting
firebase deploy
```

---

## Migration from Cloudflare

**Current state (Cloudflare):**
- Fetch worker deployed and working
- Raw snapshots in R2 at `snapshots/raw/`
- TypeScript transform placeholder (to be replaced)

**Migration steps:**
1. Set up GCP project and services
2. Port fetch logic to Cloud Function
3. Implement DuckDB processing with SQL transforms
4. Build static site with DuckDB WASM
5. Deploy to Firebase Hosting
6. Decommission Cloudflare resources

**What can be reused:**
- Socrata client logic (`src/lib/socrata.ts`)
- General fetch flow
- Understanding of data shape

---

## Next Steps

- [x] Implement fetch worker (Cloudflare - prototype)
- [x] Understand data shape and transformation needs
- [ ] Set up GCP project and services
- [ ] Port fetch logic to Cloud Function
- [ ] Implement DuckDB SQL transformations
- [ ] Output Parquet to GCS
- [ ] Build static site with DuckDB WASM
- [ ] Deploy to Firebase Hosting
- [ ] Set up Cloud Scheduler cron
- [ ] Decommission Cloudflare resources
