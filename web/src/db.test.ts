import { describe, it, expect } from "vitest";
import { slugify, getJobUrl, duckDbDateToString, Job } from "./db";

describe("slugify", () => {
  it("converts to lowercase and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugify("Application Developer (Senior)")).toBe(
      "application-developer-senior"
    );
  });

  it("handles multiple spaces and special chars", () => {
    expect(slugify("Finance, Accounting & Procurement")).toBe(
      "finance-accounting-procurement"
    );
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  Hello World!  ")).toBe("hello-world");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

describe("getJobUrl", () => {
  const mockJob: Job = {
    job_id: "38231",
    agency: "Department of Design and Construction",
    posting_type: "External",
    number_of_positions: "1",
    business_title: "Application Developer for Capital Integrated Data Solutions",
    civil_service_title: "Computer Systems Manager",
    title_classification: "Non-Competitive",
    level: "M2",
    job_category: "Technology, Data & Innovation",
    job_categories: ["Technology, Data & Innovation"],
    career_level: "Experienced",
    salary_range_from: 90000,
    salary_range_to: 120000,
    salary_frequency: "Annual",
    is_full_time: true,
    requires_exam: false,
    work_location: "QUEENS",
    division_work_unit: "Information Technology",
    job_description: "Test description",
    minimum_qual_requirements: "Bachelor's degree",
    residency_requirement: "NYC residence required",
    posted_date: "2025-01-15",
    posted_until_date: "2025-02-15",
    posting_updated_date: "2025-01-20",
  };

  it("generates correct URL format", () => {
    expect(getJobUrl(mockJob)).toBe(
      "https://cityjobs.nyc.gov/job/application-developer-for-capital-integrated-data-solutions-in-queens-jid-38231"
    );
  });

  it("handles location with special characters", () => {
    const job = { ...mockJob, work_location: "Manhattan, NY" };
    expect(getJobUrl(job)).toContain("-in-manhattan-ny-jid-");
  });
});

describe("duckDbDateToString", () => {
  it("returns empty string for null", () => {
    expect(duckDbDateToString(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(duckDbDateToString(undefined)).toBe("");
  });

  it("converts milliseconds (DuckDB WASM format) to ISO date", () => {
    // DuckDB WASM returns dates as milliseconds since epoch
    const ms = new Date("2025-01-15").getTime();
    expect(duckDbDateToString(ms)).toBe("2025-01-15");
  });

  it("converts epoch days (small numbers) to ISO date", () => {
    // Small numbers are treated as days since epoch
    const days = Math.floor(
      new Date("2025-01-15").getTime() / (24 * 60 * 60 * 1000)
    );
    expect(duckDbDateToString(days)).toBe("2025-01-15");
  });

  it("converts bigint milliseconds to ISO date", () => {
    const ms = BigInt(new Date("2025-01-15").getTime());
    expect(duckDbDateToString(ms)).toBe("2025-01-15");
  });

  it("parses ISO date string", () => {
    expect(duckDbDateToString("2025-01-15")).toBe("2025-01-15");
  });

  it("parses ISO datetime string", () => {
    expect(duckDbDateToString("2025-01-15T10:30:00Z")).toBe("2025-01-15");
  });

  it("returns original string for unparseable values", () => {
    expect(duckDbDateToString("not a date")).toBe("not a date");
  });
});

