# NYC Jobs Data Pipeline - Ops Spec

## Overview

A Cloudflare-hosted data pipeline that:

1. Periodically downloads NYC Jobs Postings dataset snapshots
2. Stores raw data in object storage
3. Runs post-processing transformations
4. Serves an interactive web UI for browsing/filtering

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Cron Trigger   │────▶│  Fetch Worker   │────▶│   R2 Bucket     │
│  (scheduled)    │     │                 │     │  (raw snapshots)│
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │ Process Worker  │
                                                │ (transform)     │
                                                └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │   D1 Database   │
                                                │ (queryable data)│
                                                └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │   Web App UI    │
                                                │ (Workers/Pages) │
                                                └─────────────────┘
```

---

## Cloudflare Services Used

| Service          | Purpose                            | Free Tier Limits                 |
| ---------------- | ---------------------------------- | -------------------------------- |
| Workers          | Run fetch, process, and API logic  | 100k requests/day                |
| Cron Triggers    | Schedule data fetching             | 5 cron triggers                  |
| R2               | Store raw dataset snapshots        | 10GB storage, 10M Class A ops/mo |
| D1               | SQLite database for queryable data | 5GB storage, 5M rows read/day    |
| Pages (optional) | Host static frontend               | Unlimited sites                  |

---

## Data Source

**NYC Jobs Postings - NYC Open Data (Tyler/Socrata)**

- Portal: https://data.cityofnewyork.us
- Dataset: kpav-sd4t
- Data API Endpoint: https://data.cityofnewyork.us/api/v3/views/kpav-sd4t/query.json
- Metadata API Endpoint: https://data.cityofnewyork.us/api/views/metadata/v1/kpav-sd4t
- Documentation: https://dev.socrata.com/foundry/data.cityofnewyork.us/kpav-sd4t
- API Auth is in ./local.env

---

## Component Specs

### 1. Fetch Worker (Scheduled)

**Trigger**: Cron schedule

**Schedule**: Daily at 4am

**Language**: Typescript

**Responsibilities**:

- Call Socrata Metadata API to get updatedAt timestamp, only proceed if later than last R2 snapshot
- Call Socrata Data API to get dataset
- Handle pagination if needed
- Store raw JSON snapshot in R2 with timestamp
- Trigger post-processing (via queue or direct call)

**R2 Storage Schema**:

```
/snapshots/
  /raw/
    /2025-01-07T06:00:00Z.json
    /2025-01-08T06:00:00Z.json
    ...
```

**Error Handling**:

- Retry on transient failures (429, 5xx)
- Log errors to whatever is the default error logging mechanism for Cloudflare Workers
- Alert on failure by email

---

### 2. Process Worker

**Trigger**: Called after fetch completes (or separate cron)

**Responsibilities**:

- Read latest raw snapshot from R2
- Apply transformations (skeleton - you fill in logic):
  - Column type casting
  - Computed columns
  - Data cleaning
  - Filtering/validation
- append processed snapshot to R2 (for later analysis application)
- replace D1 table `jobs` with latest snapshot

**D1 Schema**

```sql
CREATE TABLE jobs (
  -- Primary key (using job_id from source)
  job_id TEXT PRIMARY KEY,

  -- Agency & Organization
  agency TEXT,
  division_work_unit TEXT,

  -- Job Classification
  posting_type TEXT,                    -- Internal/External
  business_title TEXT,
  civil_service_title TEXT,
  title_classification TEXT,            -- e.g., "Competitive-1"
  title_code_no TEXT,
  level TEXT,
  job_category TEXT,

  -- Employment Type
  full_time_part_time_indicator TEXT,   -- F/P
  career_level TEXT,
  number_of_positions INTEGER,

  -- Compensation
  salary_range_from REAL,
  salary_range_to REAL,
  salary_frequency TEXT,                -- Annual/Hourly/Daily

  -- Location
  work_location TEXT,
  work_location_1 TEXT,                 -- Secondary location field
  residency_requirement TEXT,

  -- Job Details
  job_description TEXT,
  minimum_qual_requirements TEXT,
  preferred_skills TEXT,

  -- Dates
  posting_date TEXT,                    -- ISO timestamp
  post_until TEXT,                      -- Expiration date
  posting_updated TEXT,                 -- ISO timestamp
  process_date TEXT,                    -- ISO timestamp

  -- Metadata
  snapshot_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for filtering
CREATE INDEX idx_agency ON jobs(agency);
CREATE INDEX idx_job_category ON jobs(job_category);
CREATE INDEX idx_posting_date ON jobs(posting_date);
CREATE INDEX idx_salary_from ON jobs(salary_range_from);
CREATE INDEX idx_salary_to ON jobs(salary_range_to);
CREATE INDEX idx_career_level ON jobs(career_level);
CREATE INDEX idx_posting_type ON jobs(posting_type);
```

---

### 3. Web Application

**Hosting**: Cloudflare Workers (API) + Pages or inline HTML (UI)

**Features**:

- Browse all job postings in paginated table
- Filter by:
  - Agency
  - Salary range
- Sort by columns
- Search (full-text or column-specific)
- View job details

**API Endpoints**:

```
GET /api/jobs
  Query params:
    - page (number, default 1)
    - limit (number, default 50, max 100)
    - sort (string, column name)
    - order (asc|desc)
    - agency (string, filter)
    - salary_min (number, filter)
    - salary_max (number, filter)
    - location (string, filter)
    - search (string, full-text search)

  Response: { data: Job[], total: number, page: number, pages: number }

GET /api/jobs/:id
  Response: Job

GET /api/filters
  Response: { agencies: string[], locations: string[], ... }
  (For populating filter dropdowns)

GET /api/stats
  Response: { total_jobs: number, last_updated: string, ... }
```

**UI Stack Options**:

| Option          | Pros                    | Cons             |
| --------------- | ----------------------- | ---------------- |
| Vanilla HTML/JS | Simple, no build step   | More manual work |
| React/Vue SPA   | Rich interactivity      | Build complexity |
| HTMX            | Server-rendered, simple | Less common      |

**Recommendation**: [FILL IN after discussion]

### Questions to Resolve:

1. **Filter columns**: Which columns need filters? (dropdowns vs free text vs range)
2. **UI preference**: Any framework preference? Keep it minimal?
3. **Auth**: Public access or require login?
4. **Export**: Need CSV/JSON export of filtered results?

---

## Project Structure (Proposed)

```
cityjobs/
├── wrangler.toml           # Cloudflare config
├── src/
│   ├── fetch.ts            # Fetch worker (cron)
│   ├── process.ts          # Post-processing worker
│   ├── api.ts              # Web API routes
│   └── lib/
│       ├── socrata.ts      # Socrata API client
│       ├── transform.ts    # Data transformation (skeleton)
│       └── db.ts           # D1 helpers
├── migrations/
│   └── 0001_init.sql       # D1 schema
├── public/
│   └── index.html          # Frontend (if inline)
└── package.json
```

---

## Environment Variables / Secrets

| Variable            | Description                      | Required    |
| ------------------- | -------------------------------- | ----------- |
| `SOCRATA_APP_TOKEN` | API token for higher rate limits | Recommended |
| `R2_BUCKET`         | R2 bucket binding                | Yes         |
| `D1_DATABASE`       | D1 database binding              | Yes         |

---

## Deployment

1. Create R2 bucket: `wrangler r2 bucket create cityjobs-data`
2. Create D1 database: `wrangler d1 create cityjobs-db`
3. Run migrations: `wrangler d1 execute cityjobs-db --file=./migrations/0001_init.sql`
4. Deploy worker: `wrangler deploy`

---

## Open Questions Summary

Please provide answers to proceed with implementation:

### Data Source

- [ ] Dataset ID from NYC Open Data
- [ ] Do you have a Socrata app token?
- [ ] Fetch schedule (how often to pull data?)

### Processing

- [ ] List of columns to keep/transform
- [ ] Computed columns needed
- [ ] Keep historical snapshots or just latest?

### Web App

- [ ] Which columns need filter controls?
- [ ] UI framework preference (or keep minimal)?
- [ ] Public or authenticated access?
- [ ] Export functionality needed?

### Operations

- [ ] Error notification preference (or just logs)?
- [ ] Any monitoring requirements?

---

## Next Steps

Once questions are answered:

1. I'll implement the fetch worker with Socrata integration
2. Create D1 schema based on actual columns
3. Build processing worker skeleton
4. Implement API endpoints
5. Build minimal UI for browsing/filtering
