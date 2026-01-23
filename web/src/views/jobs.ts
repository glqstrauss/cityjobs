import {
  createTable,
  getCoreRowModel,
  type Table,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/table-core";
import { queryJobs, getAgencies, getCategories, Job } from "../db";

const PAGE_SIZE = 25;

interface State {
  search: string;
  agency: string;
  category: string;
  hideInternal: boolean;
  page: number;
  sorting: SortingState;
  columnVisibility: VisibilityState;
}

const state: State = {
  search: "",
  agency: "",
  category: "",
  hideInternal: true,
  page: 0,
  sorting: [{ id: "posted_date", desc: true }],
  columnVisibility: {
    work_location: false,
    career_level: false,
  },
};

// Column definitions
const columns: ColumnDef<Job, any>[] = [
  {
    id: "business_title",
    accessorKey: "business_title",
    header: "Title",
    enableSorting: true,
  },
  {
    id: "agency",
    accessorKey: "agency",
    header: "Agency",
    enableSorting: true,
  },
  {
    id: "salary_range_from",
    accessorKey: "salary_range_from",
    header: "Salary",
    enableSorting: true,
  },
  {
    id: "posted_date",
    accessorKey: "posted_date",
    header: "Posted",
    enableSorting: true,
  },
  {
    id: "work_location",
    accessorKey: "work_location",
    header: "Location",
    enableSorting: true,
  },
  {
    id: "career_level",
    accessorKey: "career_level",
    header: "Level",
    enableSorting: true,
  },
];

// Map column IDs to DuckDB column names
const columnToDbField: Record<string, string> = {
  business_title: "business_title",
  agency: "agency",
  salary_range_from: "salary_range_from",
  posted_date: "posted_date",
  work_location: "work_location",
  career_level: "career_level",
};

let table: Table<Job> | null = null;
let currentData: Job[] = [];
let totalCount = 0;

function getApp(): HTMLElement {
  return document.getElementById("app")!;
}

export async function renderJobs(): Promise<void> {
  const app = getApp();

  // Fetch filter options
  const [agencies, categories] = await Promise.all([getAgencies(), getCategories()]);

  // Build page structure
  app.innerHTML = `
    <h1>NYC Government Jobs</h1>

    <form class="filters" id="filters">
      <fieldset role="group">
        <input
          type="search"
          name="search"
          placeholder="Search jobs..."
          class="search-input"
          value="${escapeHtml(state.search)}"
        />
        <select name="agency" class="filter-select">
          <option value="">All Agencies</option>
          ${agencies.map((a) => `<option value="${escapeHtml(a)}" ${state.agency === a ? "selected" : ""}>${escapeHtml(a)}</option>`).join("")}
        </select>
        <select name="category" class="filter-select">
          <option value="">All Categories</option>
          ${categories.map((c) => `<option value="${escapeHtml(c)}" ${state.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
        </select>
        <button type="submit" id="search-btn">Search</button>
      </fieldset>
      <div class="filter-row">
        <label class="checkbox-label">
          <input type="checkbox" name="hideInternal" ${state.hideInternal ? "checked" : ""} />
          Hide internal postings
        </label>
        <button type="button" id="column-toggle-btn" class="secondary outline">Columns</button>
      </div>
    </form>

    <div id="column-menu" class="column-menu hidden">
      ${columns.map((col) => {
        const id = (col as any).accessorKey as string;
        const header = typeof (col as any).header === "string" ? (col as any).header : id;
        const checked = state.columnVisibility[id] !== false;
        return `
          <label>
            <input type="checkbox" data-column="${id}" ${checked ? "checked" : ""} />
            ${header}
          </label>
        `;
      }).join("")}
    </div>

    <div id="results">
      <p aria-busy="true">Loading jobs...</p>
    </div>
  `;

  // Set up form handler
  const form = document.getElementById("filters") as HTMLFormElement;
  const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;

  // Update button text when filters change
  const markFiltersChanged = () => {
    searchBtn.textContent = "Apply Filters";
  };
  form.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", markFiltersChanged);
    el.addEventListener("change", markFiltersChanged);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    state.search = formData.get("search") as string;
    state.agency = formData.get("agency") as string;
    state.category = formData.get("category") as string;
    state.hideInternal = formData.get("hideInternal") === "on";
    state.page = 0;
    searchBtn.textContent = "Search";
    await loadResults();
  });

  // Column visibility toggle
  const columnToggleBtn = document.getElementById("column-toggle-btn")!;
  const columnMenu = document.getElementById("column-menu")!;

  columnToggleBtn.addEventListener("click", () => {
    columnMenu.classList.toggle("hidden");
  });

  columnMenu.querySelectorAll("input[data-column]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const checkbox = e.target as HTMLInputElement;
      const columnId = checkbox.dataset.column!;
      state.columnVisibility[columnId] = checkbox.checked;
      renderTable();
    });
  });

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!columnMenu.contains(e.target as Node) && e.target !== columnToggleBtn) {
      columnMenu.classList.add("hidden");
    }
  });

  // Initial load
  await loadResults();
}

async function loadResults(): Promise<void> {
  const resultsDiv = document.getElementById("results")!;
  resultsDiv.innerHTML = '<p aria-busy="true">Loading jobs...</p>';

  try {
    // Get sort info for DuckDB
    const sortCol = state.sorting[0];
    const orderBy = sortCol ? columnToDbField[sortCol.id] || "posted_date" : "posted_date";
    const orderDir = sortCol?.desc ? "DESC" : "ASC";

    const result = await queryJobs({
      search: state.search || undefined,
      agency: state.agency || undefined,
      category: state.category || undefined,
      hideInternal: state.hideInternal,
      limit: PAGE_SIZE,
      offset: state.page * PAGE_SIZE,
      orderBy,
      orderDir,
    });

    currentData = result.rows;
    totalCount = result.totalCount;

    // Create/update table
    table = createTable({
      data: currentData,
      columns,
      getCoreRowModel: getCoreRowModel(),
      state: {
        sorting: state.sorting,
        columnVisibility: state.columnVisibility,
        columnPinning: { left: [], right: [] },
      },
      onStateChange: () => {},
      onSortingChange: (updater) => {
        state.sorting = typeof updater === "function" ? updater(state.sorting) : updater;
        state.page = 0;
        loadResults();
      },
      onColumnVisibilityChange: (updater) => {
        state.columnVisibility = typeof updater === "function" ? updater(state.columnVisibility) : updater;
        renderTable();
      },
      manualSorting: true,
      enableSortingRemoval: false,
      renderFallbackValue: null,
    });

    renderTable();
  } catch (error) {
    console.error("Error loading jobs:", error);
    resultsDiv.innerHTML = `<p>Error loading jobs. Please try again.</p>`;
  }
}

function renderTable(): void {
  if (!table) return;

  const resultsDiv = document.getElementById("results")!;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  resultsDiv.innerHTML = `
    <p><strong>${totalCount}</strong> jobs found</p>

    ${
      rows.length > 0
        ? `
      <div class="table-container">
        <table class="job-table">
          <thead>
            ${headerGroups.map((headerGroup) => `
              <tr>
                ${headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const sortIcon = sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : "";
                  return `
                    <th ${canSort ? `class="sortable" data-column-id="${header.id}"` : ""}>
                      ${header.isPlaceholder ? "" : header.column.columnDef.header}${sortIcon}
                    </th>
                  `;
                }).join("")}
              </tr>
            `).join("")}
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                ${row.getVisibleCells().map((cell) => {
                  const job = row.original;
                  const colId = cell.column.id;
                  let value: string;

                  switch (colId) {
                    case "business_title":
                      const categories = job.job_categories.length > 0
                        ? `<br><small>${job.job_categories.map((c) => escapeHtml(c)).join(", ")}</small>`
                        : "";
                      value = `<a href="#/jobs/${escapeHtml(job.job_id)}" class="job-link">${escapeHtml(job.business_title)}</a>${categories}`;
                      break;
                    case "agency":
                      value = escapeHtml(job.agency);
                      break;
                    case "salary_range_from":
                      value = formatSalary(job);
                      break;
                    case "posted_date":
                      value = formatDate(job.posted_date);
                      break;
                    case "work_location":
                      value = escapeHtml(job.work_location || "—");
                      break;
                    case "career_level":
                      value = escapeHtml(job.career_level || "—");
                      break;
                    default:
                      value = String(cell.getValue() ?? "");
                  }
                  return `<td>${value}</td>`;
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <button id="first-page" ${state.page === 0 ? "disabled" : ""}>First</button>
        <button id="prev-page" ${state.page === 0 ? "disabled" : ""}>Previous</button>
        <span>Page ${state.page + 1} of ${totalPages}</span>
        <button id="next-page" ${state.page >= totalPages - 1 ? "disabled" : ""}>Next</button>
        <button id="last-page" ${state.page >= totalPages - 1 ? "disabled" : ""}>Last</button>
      </div>
    `
        : `<p>No jobs match your criteria.</p>`
    }
  `;

  // Set up sorting handlers
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const columnId = (th as HTMLElement).dataset.columnId!;
      const column = table!.getColumn(columnId);
      if (column) {
        column.toggleSorting();
      }
    });
  });

  // Set up pagination handlers
  document.getElementById("first-page")?.addEventListener("click", async () => {
    state.page = 0;
    await loadResults();
  });

  document.getElementById("prev-page")?.addEventListener("click", async () => {
    if (state.page > 0) {
      state.page--;
      await loadResults();
    }
  });

  document.getElementById("next-page")?.addEventListener("click", async () => {
    if (state.page < totalPages - 1) {
      state.page++;
      await loadResults();
    }
  });

  document.getElementById("last-page")?.addEventListener("click", async () => {
    state.page = totalPages - 1;
    await loadResults();
  });
}

function formatSalary(job: Job): string {
  if (!job.salary_range_from) return "—";

  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const from = fmt.format(job.salary_range_from);
  const to = job.salary_range_to ? fmt.format(job.salary_range_to) : null;
  const freq = job.salary_frequency === "Annual" ? "/yr" : job.salary_frequency === "Hourly" ? "/hr" : "";

  if (to && job.salary_range_to !== job.salary_range_from) {
    return `${from} - ${to}${freq}`;
  }
  return `${from}${freq}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
