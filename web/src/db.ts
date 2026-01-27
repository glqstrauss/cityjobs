import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdb_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

const BUCKET_URL = "https://storage.googleapis.com/cityjobs-data";

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let sourceUpdatedAt: Date | null = null;
let ftsEnabled = false;

async function doQuery(c: duckdb.AsyncDuckDBConnection, query: string) {
  console.log(query);
  return await c.query(query);
}

export async function initDb(): Promise<void> {
  // Initialize DuckDB WASM with local bundles (Vite handles the URLs)
  const worker = new Worker(duckdb_worker, { type: "module" });
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(duckdb_wasm);

  conn = await db.connect();

  // Fetch metadata to get parquet path
  const metadataRes = await fetch(`${BUCKET_URL}/metadata.json`);
  const metadata = await metadataRes.json();
  const parquetPath = metadata.processed_path;

  if (!parquetPath) {
    throw new Error("No processed_path in metadata.json");
  }

  // Store source updated date
  if (metadata.source_updated_at) {
    sourceUpdatedAt = new Date(metadata.source_updated_at);
  }

  // Register the parquet file
  const parquetUrl = `${BUCKET_URL}/${parquetPath}`;
  await db.registerFileURL("jobs.parquet", parquetUrl, duckdb.DuckDBDataProtocol.HTTP, false);

  // Create table for easy querying (table instead of view for FTS support)
  await doQuery(conn, `CREATE TABLE jobs AS SELECT uuid() as id, * FROM 'jobs.parquet'`);

  // Create FTS index for advanced search
  await createFtsIndex();

  console.log("DuckDB initialized with jobs data");
}

async function createFtsIndex(): Promise<void> {
  if (!conn) return;

  try {
    // Install and load FTS extension
    await conn.query(`INSTALL fts`);
    await conn.query(`LOAD fts`);

    // Create FTS index on relevant columns
    await doQuery(conn, `
      PRAGMA create_fts_index(
        'jobs',
        'id',
        'business_title', 'job_description', 'agency', 'civil_service_title',
        stemmer = 'english',
        stopwords = 'english',
        lower = 1,
        strip_accents = 1,
        overwrite = 1
      )
    `);

    ftsEnabled = true;
    console.log("FTS index created successfully");
  } catch (error) {
    console.warn("Failed to create FTS index, falling back to ILIKE search:", error);
    ftsEnabled = false;
  }
}

export function isFtsEnabled(): boolean {
  return ftsEnabled;
}

export function getDb(): duckdb.AsyncDuckDB | null {
  return db;
}

export function getSourceUpdatedAt(): Date | null {
  return sourceUpdatedAt;
}

export interface Job {
  id: string;
  job_id: string;
  agency: string;
  posting_type: string;
  number_of_positions: string;
  business_title: string;
  civil_service_title: string;
  title_classification: string;
  level: string;
  job_category: string;
  job_categories: string[];
  career_level: string;
  salary_range_from: number | null;
  salary_range_to: number | null;
  salary_frequency: string;
  is_full_time: boolean;
  requires_exam: boolean;
  work_location: string;
  division_work_unit: string;
  job_description: string;
  minimum_qual_requirements: string;
  residency_requirement: string;
  posted_date: string;
  posted_until_date: string;
  posting_updated_date: string;
}

export interface QueryResult<T> {
  rows: T[];
  totalCount: number;
}

// Escape string for SQL (prevent SQL injection)
function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

export async function queryJobs(options: {
  search?: string;
  useFts?: boolean;
  agencies?: string[];
  categories?: string[];
  civilServiceTitles?: string[];
  careerLevels?: string[];
  fullTimeFilter?: string[];
  examFilter?: string[];
  postingTypes?: string[];
  salaryMin?: number;
  salaryMax?: number;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
}): Promise<QueryResult<Job>> {
  if (!conn) throw new Error("Database not initialized");

  const conditions: string[] = [];
  let useRelevanceOrder = false;

  if (options.search) {
    const escaped = escapeSql(options.search);

    if (options.useFts && ftsEnabled) {
      // FTS search handled separately via CTE
      useRelevanceOrder = true;
    } else {
      // Fall back to ILIKE search
      conditions.push(`(
        business_title ILIKE '%${escaped}%'
        OR agency ILIKE '%${escaped}%'
        OR job_description ILIKE '%${escaped}%'
      )`);
    }
  }

  if (options.agencies && options.agencies.length > 0) {
    const agencyList = options.agencies.map((a) => `'${escapeSql(a)}'`).join(", ");
    conditions.push(`agency IN (${agencyList})`);
  }

  if (options.categories && options.categories.length > 0) {
    // Job matches if any of its categories are in the selected list
    const categoryConditions = options.categories.map(
      (c) => `list_contains(job_categories, '${escapeSql(c)}')`
    );
    conditions.push(`(${categoryConditions.join(" OR ")})`);
  }

  if (options.civilServiceTitles && options.civilServiceTitles.length > 0) {
    const titles = options.civilServiceTitles.map((t) => `'${escapeSql(t)}'`).join(", ");
    conditions.push(`civil_service_title IN (${titles})`);
  }

  if (options.careerLevels && options.careerLevels.length > 0) {
    const levels = options.careerLevels.map((l) => `'${escapeSql(l)}'`).join(", ");
    conditions.push(`career_level IN (${levels})`);
  }

  if (options.fullTimeFilter && options.fullTimeFilter.length > 0) {
    const ftConditions: string[] = [];
    if (options.fullTimeFilter.includes("full_time")) {
      ftConditions.push("is_full_time = true");
    }
    if (options.fullTimeFilter.includes("part_time")) {
      ftConditions.push("is_full_time = false");
    }
    if (ftConditions.length > 0 && ftConditions.length < 2) {
      conditions.push(`(${ftConditions.join(" OR ")})`);
    }
  }

  if (options.examFilter && options.examFilter.length > 0) {
    const examConditions: string[] = [];
    if (options.examFilter.includes("requires_exam")) {
      examConditions.push("requires_exam = true");
    }
    if (options.examFilter.includes("no_exam")) {
      examConditions.push("requires_exam = false");
    }
    if (examConditions.length > 0 && examConditions.length < 2) {
      conditions.push(`(${examConditions.join(" OR ")})`);
    }
  }

  if (options.postingTypes && options.postingTypes.length > 0 && options.postingTypes.length < 2) {
    // Only filter if one type is selected (not both)
    const types = options.postingTypes.map((t) => `'${escapeSql(t)}'`).join(", ");
    conditions.push(`posting_type IN (${types})`);
  }

  // Salary range filter: job matches if ranges overlap
  // User's range [salaryMin, salaryMax] intersects with job's range [salary_range_from, salary_range_to]
  if (options.salaryMin != null) {
    conditions.push(`salary_range_to >= ${options.salaryMin}`);
  }
  if (options.salaryMax != null) {
    conditions.push(`salary_range_from <= ${options.salaryMax}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options.limit || 25;
  const offset = options.offset || 0;

  let countQuery: string;
  let dataQuery: string;

  if (useRelevanceOrder && options.search) {
    // FTS query: compute scores in subquery, filter on score in outer query
    const escaped = escapeSql(options.search);
    const baseTable = `(
      SELECT jobs.*, fts_main_jobs.match_bm25(jobs.id, '${escaped}') AS fts_score
      FROM jobs
    ) AS scored_jobs`;

    // Filter for non-null FTS score (i.e., matches) plus any other conditions
    const ftsConditions = ["fts_score IS NOT NULL", ...conditions];
    const ftsWhere = `WHERE ${ftsConditions.join(" AND ")}`;

    countQuery = `SELECT COUNT(*) as count FROM ${baseTable} ${ftsWhere}`;
    dataQuery = `
      SELECT * FROM ${baseTable}
      ${ftsWhere}
      ORDER BY fts_score DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    // Standard query
    const orderBy = options.orderBy || "posted_date";
    const orderDir = options.orderDir || "DESC";

    countQuery = `SELECT COUNT(*) as count FROM jobs ${where}`;
    dataQuery = `
      SELECT * FROM jobs
      ${where}
      ORDER BY ${orderBy} ${orderDir}
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  // Get total count
  const countResult = await doQuery(conn, countQuery);
  const totalCount = Number(countResult.get(0)?.count ?? 0);

  // Get rows
  const result = await doQuery(conn, dataQuery);

  const rows: Job[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row) {
      rows.push(rowToJob(row));
    }
  }

  return { rows, totalCount };
}

export async function getJob(id: string): Promise<Job | null> {
  if (!conn) throw new Error("Database not initialized");

  const result = await doQuery(conn, `SELECT * FROM jobs WHERE id = '${escapeSql(id)}'`);

  if (result.numRows === 0) return null;

  const row = result.get(0);
  return row ? rowToJob(row) : null;
}

export async function getAgencies(): Promise<string[]> {
  if (!conn) throw new Error("Database not initialized");

  const result = await doQuery(conn, `
    SELECT DISTINCT agency FROM jobs
    WHERE agency IS NOT NULL
    ORDER BY agency
  `);

  const agencies: string[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row?.agency) agencies.push(String(row.agency));
  }
  return agencies;
}

export async function getCategories(): Promise<string[]> {
  if (!conn) throw new Error("Database not initialized");

  const result = await doQuery(conn, `
    SELECT DISTINCT unnest(job_categories) as category
    FROM jobs
    WHERE job_categories IS NOT NULL
    ORDER BY category
  `);

  const categories: string[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row?.category) categories.push(String(row.category));
  }
  return categories;
}

export async function getCivilServiceTitles(): Promise<string[]> {
  if (!conn) throw new Error("Database not initialized");

  const result = await doQuery(conn, `
    SELECT DISTINCT civil_service_title FROM jobs
    WHERE civil_service_title IS NOT NULL AND civil_service_title != ''
    ORDER BY civil_service_title
  `);

  const titles: string[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row?.civil_service_title) titles.push(String(row.civil_service_title));
  }
  return titles;
}

// Generate cityjobs.nyc.gov search URL for a job
export function getJobUrl(job: Job): string {
  const query = `${job.business_title} ${job.agency}`.replace(/\s+/g, "_");
  return `https://cityjobs.nyc.gov/jobs?q=${encodeURIComponent(query)}`;
}

// Convert DuckDB DATE to ISO date string
export function duckDbDateToString(value: unknown): string {
  if (value == null) return "";

  // DuckDB WASM returns dates as milliseconds since epoch
  if (typeof value === "number" || typeof value === "bigint") {
    const num = Number(value);
    // Large numbers (> 1 billion) are milliseconds, small numbers are days
    const ms = num > 1_000_000_000 ? num : num * 24 * 60 * 60 * 1000;
    const date = new Date(ms);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Handle Date objects directly
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().split("T")[0];
  }

  // Fallback: try parsing as string
  const str = String(value);
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return str;
}

// Helper to convert DuckDB row to Job object
function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id ?? ""),
    job_id: String(row.job_id ?? ""),
    agency: String(row.agency ?? ""),
    posting_type: String(row.posting_type ?? ""),
    number_of_positions: String(row.number_of_positions ?? ""),
    business_title: String(row.business_title ?? ""),
    civil_service_title: String(row.civil_service_title ?? ""),
    title_classification: String(row.title_classification ?? ""),
    level: String(row.level ?? ""),
    job_category: String(row.job_category ?? ""),
    job_categories: Array.isArray(row.job_categories) ? row.job_categories.map(String) : [],
    career_level: String(row.career_level ?? ""),
    salary_range_from: row.salary_range_from != null ? Number(row.salary_range_from) : null,
    salary_range_to: row.salary_range_to != null ? Number(row.salary_range_to) : null,
    salary_frequency: String(row.salary_frequency ?? ""),
    is_full_time: Boolean(row.is_full_time),
    requires_exam: Boolean(row.requires_exam),
    work_location: String(row.work_location ?? ""),
    division_work_unit: String(row.division_work_unit ?? ""),
    job_description: String(row.job_description ?? ""),
    minimum_qual_requirements: String(row.minimum_qual_requirements ?? ""),
    residency_requirement: String(row.residency_requirement ?? ""),
    posted_date: duckDbDateToString(row.posted_date),
    posted_until_date: duckDbDateToString(row.posted_until_date),
    posting_updated_date: duckDbDateToString(row.posting_updated_date),
  };
}
