import type { SocrataJob } from "./socrata";

export interface ProcessedJob {
  job_id: string;

  // Agency & Organization
  agency: string;
  division_work_unit: string | null;

  // Job Classification
  posting_type: "Internal" | "External" | string;
  business_title: string;
  civil_service_title: string;
  title_classification: string | null;
  title_code_no: string | null;
  level: string | null;
  job_category: string | null;

  // Employment Type
  full_time_part_time_indicator: "F" | "P" | string | null;
  career_level: string | null;
  number_of_positions: number;

  // Compensation (normalized to annual)
  salary_range_from: number | null;
  salary_range_to: number | null;
  salary_frequency: "Annual" | "Hourly" | "Daily" | string;
  salary_range_from_annual: number | null;
  salary_range_to_annual: number | null;

  // Location
  work_location: string | null;
  work_location_1: string | null;
  residency_requirement: string | null;

  // Job Details
  job_description: string;
  minimum_qual_requirements: string | null;
  preferred_skills: string | null;

  // Dates (ISO format)
  posting_date: string | null;
  post_until: string | null;
  posting_updated: string | null;
  process_date: string | null;
}

export function transformJob(raw: SocrataJob): ProcessedJob {
  const salaryFrom = parseNumber(raw.salary_range_from);
  const salaryTo = parseNumber(raw.salary_range_to);
  const frequency = raw.salary_frequency || "Annual";

  return {
    job_id: raw.job_id,

    // Agency & Organization
    agency: cleanString(raw.agency) || "Unknown",
    division_work_unit: cleanString(raw.division_work_unit),

    // Job Classification
    posting_type: cleanString(raw.posting_type) || "External",
    business_title: cleanString(raw.business_title) || "Untitled",
    civil_service_title: cleanString(raw.civil_service_title) || "",
    title_classification: cleanString(raw.title_classification),
    title_code_no: cleanString(raw.title_code_no),
    level: cleanString(raw.level),
    job_category: cleanString(raw.job_category),

    // Employment Type
    full_time_part_time_indicator: cleanString(raw.full_time_part_time_indicator),
    career_level: cleanString(raw.career_level),
    number_of_positions: parseNumber(raw.number_of_positions) || 1,

    // Compensation
    salary_range_from: salaryFrom,
    salary_range_to: salaryTo,
    salary_frequency: frequency,
    salary_range_from_annual: normalizeToAnnual(salaryFrom, frequency),
    salary_range_to_annual: normalizeToAnnual(salaryTo, frequency),

    // Location
    work_location: cleanString(raw.work_location),
    work_location_1: cleanString(raw.work_location_1),
    residency_requirement: cleanString(raw.residency_requirement),

    // Job Details
    job_description: cleanString(raw.job_description) || "",
    minimum_qual_requirements: cleanString(raw.minimum_qual_requirements),
    preferred_skills: cleanString(raw.preferred_skills),

    // Dates
    posting_date: parseDate(raw.posting_date),
    post_until: parseDate(raw.post_until),
    posting_updated: parseDate(raw.posting_updated),
    process_date: parseDate(raw.process_date),
  };
}

export function transformJobs(rawJobs: SocrataJob[]): ProcessedJob[] {
  return rawJobs.map(transformJob);
}

function cleanString(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseNumber(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const cleaned = value.replace(/[,$]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  // Handle ISO format (2025-12-10T00:00:00.000)
  if (trimmed.includes("T")) {
    return trimmed;
  }

  // Handle DD-MMM-YYYY format (09-JAN-2026)
  const match = trimmed.match(/^(\d{2})-([A-Z]{3})-(\d{4})$/i);
  if (match) {
    const [, day, monthStr, year] = match;
    const months: Record<string, string> = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04",
      MAY: "05", JUN: "06", JUL: "07", AUG: "08",
      SEP: "09", OCT: "10", NOV: "11", DEC: "12",
    };
    const month = months[monthStr.toUpperCase()];
    if (month) {
      return `${year}-${month}-${day}T00:00:00.000`;
    }
  }

  return trimmed;
}

function normalizeToAnnual(salary: number | null, frequency: string): number | null {
  if (salary === null) return null;

  switch (frequency.toLowerCase()) {
    case "hourly":
      return Math.round(salary * 2080); // 40 hrs/week * 52 weeks
    case "daily":
      return Math.round(salary * 260); // 5 days/week * 52 weeks
    case "annual":
    default:
      return salary;
  }
}
