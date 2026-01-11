import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdb_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";

const BUCKET_URL = "https://storage.googleapis.com/cityjobs-data";

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

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
  const parquetPath = metadata.processedPath;

  if (!parquetPath) {
    throw new Error("No processedPath in metadata.json");
  }

  // Register the parquet file
  const parquetUrl = `${BUCKET_URL}/${parquetPath}`;
  await db.registerFileURL("jobs.parquet", parquetUrl, duckdb.DuckDBDataProtocol.HTTP, false);

  // Create view for easy querying
  await conn.query(`CREATE VIEW jobs AS SELECT * FROM 'jobs.parquet'`);

  console.log("DuckDB initialized with jobs data");
}

export interface Job {
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
  agency?: string;
  category?: string;
  isFullTime?: boolean;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
}): Promise<QueryResult<Job>> {
  if (!conn) throw new Error("Database not initialized");

  const conditions: string[] = [];

  if (options.search) {
    const escaped = escapeSql(options.search);
    conditions.push(`(
      business_title ILIKE '%${escaped}%'
      OR agency ILIKE '%${escaped}%'
      OR job_description ILIKE '%${escaped}%'
    )`);
  }

  if (options.agency) {
    conditions.push(`agency = '${escapeSql(options.agency)}'`);
  }

  if (options.category) {
    conditions.push(`list_contains(job_categories, '${escapeSql(options.category)}')`);
  }

  if (options.isFullTime !== undefined) {
    conditions.push(`is_full_time = ${options.isFullTime}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = options.orderBy || "posted_date";
  const orderDir = options.orderDir || "DESC";
  const limit = options.limit || 25;
  const offset = options.offset || 0;

  // Get total count
  const countResult = await conn.query(`SELECT COUNT(*) as count FROM jobs ${where}`);
  const totalCount = Number(countResult.get(0)?.count ?? 0);

  // Get rows
  const query = `
    SELECT * FROM jobs
    ${where}
    ORDER BY ${orderBy} ${orderDir}
    LIMIT ${limit} OFFSET ${offset}
  `;
  const result = await conn.query(query);

  const rows: Job[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i);
    if (row) {
      rows.push(rowToJob(row));
    }
  }

  return { rows, totalCount };
}

export async function getJob(jobId: string): Promise<Job | null> {
  if (!conn) throw new Error("Database not initialized");

  const result = await conn.query(`SELECT * FROM jobs WHERE job_id = '${escapeSql(jobId)}'`);

  if (result.numRows === 0) return null;

  const row = result.get(0);
  return row ? rowToJob(row) : null;
}

export async function getAgencies(): Promise<string[]> {
  if (!conn) throw new Error("Database not initialized");

  const result = await conn.query(`
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

  const result = await conn.query(`
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

// Helper to convert DuckDB row to Job object
function rowToJob(row: Record<string, unknown>): Job {
  return {
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
    posted_date: String(row.posted_date ?? ""),
    posted_until_date: String(row.posted_until_date ?? ""),
    posting_updated_date: String(row.posting_updated_date ?? ""),
  };
}
