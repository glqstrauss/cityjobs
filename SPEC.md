# NYC Jobs Data Pipeline - Spec

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

| Service         | Purpose                          | Free Tier Limits (Always Free) |
| --------------- | -------------------------------- | ------------------------------ |
| Cloud Functions | Fetch data + DuckDB processing   | 2M invocations/mo, 400k GB-sec |
| Cloud Scheduler | Daily cron trigger               | 3 jobs                         |
| Cloud Storage   | Raw JSON + Parquet + static site | 5GB in US regions              |

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
6. Update metadata.json with processedPath

**GCS Storage Schema**:

```
gs://cityjobs-data/
├── raw/
│   ├── 2025-01-07T06:00:00Z.json
│   └── ...
├── processed/
│   └── 2025-01-07T06:00:00Z.parquet
├── metadata.json             # Last update timestamps + paths
└── index.html                # Static site entry point
```

**Processed Data Schema**:

| Column                    | Type      | Description                  |
| ------------------------- | --------- | ---------------------------- |
| job_id                    | VARCHAR   | Unique job identifier        |
| agency                    | VARCHAR   | NYC agency name              |
| posting_type              | VARCHAR   | Internal/External            |
| number_of_positions       | VARCHAR   | Number of openings           |
| business_title            | VARCHAR   | Job title                    |
| civil_service_title       | VARCHAR   | Official civil service title |
| title_classification      | VARCHAR   | Competitive/Non-Competitive  |
| level                     | VARCHAR   | Position level               |
| job_category              | VARCHAR   | Raw category string          |
| job_categories            | VARCHAR[] | Parsed category array        |
| career_level              | VARCHAR   | Entry/Experienced/Executive  |
| salary_range_from         | DOUBLE    | Minimum salary               |
| salary_range_to           | DOUBLE    | Maximum salary               |
| salary_frequency          | VARCHAR   | Annual/Hourly/Daily          |
| is_full_time              | BOOLEAN   | Full-time indicator          |
| requires_exam             | BOOLEAN   | Civil service exam required  |
| work_location             | VARCHAR   | Office location              |
| division_work_unit        | VARCHAR   | Department/division          |
| job_description           | VARCHAR   | Full description text        |
| minimum_qual_requirements | VARCHAR   | Required qualifications      |
| residency_requirement     | VARCHAR   | NYC residency rules          |
| posted_date               | DATE      | Original posting date        |
| posted_until_date         | DATE      | Application deadline         |
| posting_updated_date      | DATE      | Last update date             |

**Job Categories** (14 total):

- Administration & Human Resources
- Building Operations & Maintenance
- Communications & Intergovernmental Affairs
- Constituent Services & Community Programs
- Engineering, Architecture, & Planning
- Finance, Accounting, & Procurement
- Green Jobs
- Health
- Legal Affairs
- Mental Health
- Policy, Research & Analysis
- Public Safety, Inspections, & Enforcement
- Social Services
- Technology, Data & Innovation

---

### 2. Web Application

**Hosting**: GCS Static Website Hosting

**Query Engine**: DuckDB WASM (runs entirely in browser)

**Stack**: Vanilla TypeScript + DuckDB WASM (minimal dependencies)

**URL**: `https://storage.googleapis.com/cityjobs-data/index.html`

#### Views/Routes

The app is a single-page application with hash-based routing:

| Route            | View       | Description                    |
| ---------------- | ---------- | ------------------------------ |
| `#/` or `#/jobs` | Jobs       | Main job search and listing    |
| `#/jobs/:id`     | Job Detail | Individual job posting details |
| `#/faq`          | FAQ        | Frequently asked questions     |
| `#/resources`    | Resources  | Additional resources and links |

#### Jobs View

Primary view for searching and browsing jobs.

**Search/Filter Options**:

- Text search (searches title, description, agency)
- Agency dropdown
- Category multi-select
- Salary range slider
- Full-time/Part-time toggle
- Career level filter

**Results Display**:

- Paginated table with sortable columns
- Columns: Title, Agency, Salary, Posted Date, Category
- Click row to view details

#### Job Detail View

Shows full job posting information:

- Title, agency, location
- Full description
- Qualifications
- Salary range
- How to apply
- Link to official posting

#### FAQ View

Static content answering common questions:

- What is this site?
- Where does the data come from?
- How often is it updated?
- How do I apply for a job?
- What does "Competitive" mean?
- What are civil service exams?

#### Resources View

Links to external resources:

- NYC Jobs official site
- Civil service exam schedules
- NYC agency directory
- Career resources

#### How It Works

1. Static HTML/JS loads from GCS bucket
2. On page load, fetches latest Parquet from `metadata.json` path
3. DuckDB WASM loads the Parquet file into memory
4. All filtering/sorting/searching runs locally via SQL queries
5. No server-side API needed

---

## Project Structure

```
cityjobs/
├── pyproject.toml            # Python dependencies (UV)
├── .pre-commit-config.yaml   # Pre-commit hooks
├── functions/                # Python Cloud Function
│   ├── main.py               # Entry point (HTTP handler)
│   ├── fetch.py              # Socrata fetching logic
│   ├── process.py            # DuckDB processing
│   ├── requirements.txt      # Generated from pyproject.toml
│   └── sql/
│       └── transform.sql     # DuckDB transformation queries
├── web/                      # Static frontend
│   ├── index.html
│   ├── src/
│   │   ├── main.ts           # Entry point
│   │   ├── router.ts         # Hash-based routing
│   │   ├── db.ts             # DuckDB WASM wrapper
│   │   └── views/
│   │       ├── jobs.ts
│   │       ├── job-detail.ts
│   │       ├── faq.ts
│   │       └── resources.ts
│   └── style.css
├── cors.json                 # GCS CORS configuration
├── SPEC.md                   # This file
├── CLAUDE.md                 # Claude Code guidelines
└── local.env                 # Local secrets (gitignored)
```

---

## Environment Variables / Secrets

| Variable                 | Description               | Storage         |
| ------------------------ | ------------------------- | --------------- |
| `SOCRATA_APP_KEY_ID`     | Socrata API key ID        | Secret Manager  |
| `SOCRATA_APP_KEY_SECRET` | Socrata API key secret    | Secret Manager  |
| `GCS_BUCKET`             | Cloud Storage bucket name | Environment var |

---

## Deployment

**Cloud Function:**

```bash
gcloud functions deploy cityjobs-fetch \
  --gen2 --runtime python311 --region us-east1 \
  --trigger-http --no-allow-unauthenticated \
  --entry-point main --source ./functions \
  --set-env-vars GCS_BUCKET=cityjobs-data,GCP_PROJECT=city-jobs-483916 \
  --set-secrets 'SOCRATA_APP_KEY_ID=SOCRATA_APP_KEY_ID:latest,SOCRATA_APP_KEY_SECRET=SOCRATA_APP_KEY_SECRET:latest'
```

**Static site:**

```bash
# Build (if using bundler)
cd web && npm run build

# Deploy to GCS
gsutil -m cp -r web/dist/* gs://cityjobs-data/
```

---

## Status

**Completed:**

- [x] GCP project setup (APIs, bucket, secrets)
- [x] Cloud Function fetch pipeline
- [x] Cloud Scheduler cron (4am UTC)
- [x] DuckDB SQL transformations
- [x] Parquet output to GCS
- [x] Pre-commit hooks (uv, black, sqlfmt)
- [x] Web UI scaffolding (Vite + TypeScript + Pico CSS)
- [x] DuckDB WASM integration (loads parquet from GCS)
- [x] Hash-based router
- [x] Views: Jobs list, Job detail, FAQ, Resources

**In Progress:**

- [ ] QA and bug fixes for web UI

---

## QA TODOs

### Quick Wins

- [x] Fix "Invalid Date" display - date parsing issue
- [x] Fix job link URLs - construct cityjobs.nyc.gov format in DuckDB transform
- [x] Table CSS: smaller font, horizontal scroll, better density
- [ ] Show actual last updated date from metadata.json `source_updated_at`. This is still not done on the job search page...
- [ ] Changing a filter should change the search button to "Apply Filters" to indicate re-query is needed
- [ ] Instead of the whole row being clickable in the job list, only make the job title a link. This avoids accidental clicks when trying to select text.
- [ ]

### TanStack Table Integration

Replace current table with TanStack Table (headless) for:

- [ ] Column sorting (wired to DuckDB ORDER BY)
- [ ] Column visibility toggle (show/hide columns)
- [ ] Dynamic filtering on all fields (wired to DuckDB WHERE)
- [ ] Better pagination controls

Library: `@tanstack/table-core` (~15kb, vanilla JS)
Approach: TanStack manages UI state, DuckDB executes queries

### Job Link Format

It's not possible to directly generate the URL so instead we generate a search URL consisting of job title and agency
https://cityjobs.nyc.gov/jobs?q=Senior_Data_Analyst_DEPARTMENT_OF_TRANSPORTATION

### Dev Ergonomics

- [ ] Wrap website deployment in `npm deploy` script
- [ ] Wrap Cloud Function deployment in `deploy.sh` script
