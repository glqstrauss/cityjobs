-- NYC Jobs D1 Schema
-- Based on Socrata dataset kpav-sd4t
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
