import { describe, it, expect } from "vitest";
import { getJobUrl, duckDbDateToString, Job } from "./db";

describe("getJobUrl", () => {
  it("generates search URL with title and agency", () => {
    const job = { business_title: "Data Analyst", agency: "NYPD" } as Job;
    expect(getJobUrl(job)).toBe(
      "https://cityjobs.nyc.gov/jobs?q=Data_Analyst_NYPD"
    );
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

