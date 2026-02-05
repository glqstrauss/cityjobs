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

1. Fetch 1 record from Socrata to get `process_date` (lightweight dedup check)
2. Skip if raw file for that `process_date` already exists
3. Fetch all job postings from Socrata API
4. Store raw JSON snapshot in GCS
5. Run DuckDB SQL transformations
6. Export processed data as Parquet to GCS
7. Rebuild `jobs_history.parquet` (all snapshots, excludes large text columns)
8. Update `metadata.json` with latest timestamps

**GCS Storage Schema**:

```
gs://cityjobs-data/
├── raw/                          # Raw JSON snapshots (keyed by process_date)
│   ├── 2026-01-26T00:00:00+00:00.json
│   └── ...
├── processed/                    # Per-snapshot Parquet (full columns)
│   ├── 2026-01-26T00:00:00+00:00.parquet
│   └── ...
├── jobs_history.parquet          # All snapshots combined (excludes large text cols)
├── metadata.json                 # Pipeline state (source_updated_at, timestamps)
├── index.html                    # Static site entry point
└── assets/                       # Gzipped JS/CSS/WASM bundles
```

**Processed Data Schema**:

| Column                    | Type      | Description                           |
| ------------------------- | --------- | ------------------------------------- |
| id                        | VARCHAR   | Stable row ID (md5 hash of full row)  |
| job_id                    | VARCHAR   | Socrata job identifier                |
| agency                    | VARCHAR   | NYC agency name                       |
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
| posting_updated_date      | DATE      | Last update date                      |
| processed_date            | DATE      | Socrata process_date (snapshot date)  |

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
| `#/console`      | Console    | DuckDB WASM console (dev only) |

#### Jobs View

Primary view for searching and browsing jobs.

**Search/Filter Options**:

- Text search (searches title, description, agency) with optional FTS (`?fts=1`)
- Agency multi-select
- Category multi-select
- Civil service title multi-select
- Career level multi-select
- Posting type (Internal/External)
- Full-time / Part-time toggle
- Requires exam toggle
- Salary range (min/max inputs)
- Posted date filter (last 7/30/90 days or custom range)

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
├── .pre-commit-config.yaml   # Pre-commit hooks (uv, black, sqlfmt)
├── functions/                # Python Cloud Function
│   ├── main.py               # Entry point (HTTP handler, orchestration)
│   ├── models.py             # PipelineState dataclass (mashumaro)
│   ├── fetch.py              # Socrata fetching logic
│   ├── process.py            # DuckDB processing + jobs_history
│   ├── requirements.txt      # Generated from pyproject.toml
│   └── sql/
│       └── transform.sql     # DuckDB transformation queries
├── web/                      # Static frontend
│   ├── deploy.sh             # Build + gzip compress + upload to GCS
│   ├── index.html
│   ├── src/
│   │   ├── main.ts           # Entry point
│   │   ├── router.ts         # Hash-based routing
│   │   ├── db.ts             # DuckDB WASM wrapper + FTS index
│   │   └── views/
│   │       ├── jobs.ts
│   │       ├── job-detail.ts
│   │       ├── faq.ts
│   │       ├── resources.ts
│   │       └── console.ts    # DuckDB WASM shell (dev tool)
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

- [ ] Metrics dashboard (backend `jobs_history.parquet` ready, frontend stashed)

---

## Design Decisions

### Job Link Format

It's not possible to directly link to a job on cityjobs.nyc.gov, so we generate a search URL:
`https://cityjobs.nyc.gov/jobs?q=Senior_Data_Analyst_DEPARTMENT_OF_TRANSPORTATION`

### Deduplication

Socrata's `dataUpdatedAt` metadata timestamp can change even when actual data hasn't changed. We use `process_date` (from the data itself) to deduplicate raw snapshots. The pipeline fetches 1 record to check `process_date` before deciding whether to fetch the full dataset.

### Jobs History

`jobs_history.parquet` at bucket root combines all `processed/*.parquet` snapshots via DuckDB glob, excluding large text columns (`job_description`, `minimum_qual_requirements`, `residency_requirement`). Rebuilt from scratch on every pipeline run.

---

## Future Enhancements

- [ ] Metrics dashboard with historical data from `jobs_history.parquet`
- [ ] FTS Performance: Pre-build FTS index in Cloud Function pipeline (currently built on each page load)
- [ ] Dynamic filter options: Update available values based on current selections (with counts per option)
- [ ] Add a logo
