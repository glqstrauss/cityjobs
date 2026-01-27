import {
  createTable,
  getCoreRowModel,
  type Table,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/table-core";
import { queryJobs, getAgencies, getCategories, getCivilServiceTitles, isFtsEnabled, Job } from "../db";

// Check if FTS feature flag is enabled via URL parameter
const urlParams = new URLSearchParams(window.location.search);
const ftsFeatureEnabled = urlParams.get("fts") === "1";

const PAGE_SIZE = 25;

interface State {
  search: string;
  useFts: boolean;
  agencies: string[];
  categories: string[];
  civilServiceTitles: string[];
  careerLevels: string[];
  fullTimeFilter: string[];
  examFilter: string[];
  postingTypes: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  page: number;
  sorting: SortingState;
  columnVisibility: VisibilityState;
}

const state: State = {
  search: "",
  useFts: false,
  agencies: [],
  categories: [],
  civilServiceTitles: [],
  careerLevels: [],
  fullTimeFilter: [],
  examFilter: [],
  postingTypes: ["External"],
  salaryMin: null,
  salaryMax: null,
  page: 0,
  sorting: [{ id: "posted_date", desc: true }],
  columnVisibility: {
    work_location: false,
    career_level: false,
    civil_service_title: false,
    title_classification: false,
    is_full_time: false,
  },
};

// Filter options
const careerLevelOptions = ["Entry-Level", "Experienced (non-manager)", "Manager", "Executive"];
const fullTimeOptions = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
];
const examOptions = [
  { value: "requires_exam", label: "Required" },
  { value: "no_exam", label: "Not required" },
];
const postingTypeOptions = [
  { value: "Internal", label: "Internal" },
  { value: "External", label: "External" },
];

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
  {
    id: "civil_service_title",
    accessorKey: "civil_service_title",
    header: "Civil Service Title",
    enableSorting: true,
  },
  {
    id: "title_classification",
    accessorKey: "title_classification",
    header: "Classification",
    enableSorting: true,
  },
  {
    id: "is_full_time",
    accessorKey: "is_full_time",
    header: "Full Time",
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
  civil_service_title: "civil_service_title",
  title_classification: "title_classification",
  is_full_time: "is_full_time",
};

let table: Table<Job> | null = null;
let currentData: Job[] = [];
let totalCount = 0;
let allAgencies: string[] = [];
let allCategories: string[] = [];
let allCivilServiceTitles: string[] = [];

// Track which dropdown is open
let openDropdown: string | null = null;

function getApp(): HTMLElement {
  return document.getElementById("app")!;
}

// Render a multi-select dropdown
function renderMultiSelectDropdown(
  id: string,
  label: string,
  options: { value: string; label: string }[],
  selected: string[]
): string {
  const count = selected.length;
  const isOpen = openDropdown === id;
  const showSearch = options.length > 10;

  // Sort options: selected first, then alphabetically
  const sortedOptions = [...options].sort((a, b) => {
    const aSelected = selected.includes(a.value);
    const bSelected = selected.includes(b.value);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return a.label.localeCompare(b.label);
  });

  return `
    <div class="multi-select" data-dropdown="${id}">
      <button type="button" class="multi-select-btn" data-toggle="${id}">
        ${escapeHtml(label)}
        ${count > 0 ? `<span class="count">${count}</span>` : ""}
        ▼
      </button>
      <div class="multi-select-menu ${isOpen ? "" : "hidden"}" data-menu="${id}">
        <div class="select-all">
          <button type="button" class="secondary outline" data-select-all="${id}">All</button>
          <button type="button" class="secondary outline" data-select-none="${id}">None</button>
        </div>
        ${showSearch ? `<div class="dropdown-search"><input type="text" placeholder="Search..." data-search="${id}" /></div>` : ""}
        <div class="dropdown-options" data-options="${id}">
          ${sortedOptions
            .map(
              (opt) => `
            <label data-option-value="${escapeHtml(opt.value.toLowerCase())}">
              <input type="checkbox" data-filter="${id}" value="${escapeHtml(opt.value)}" ${selected.includes(opt.value) ? "checked" : ""} />
              ${escapeHtml(opt.label)}
            </label>
          `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

// Render column visibility dropdown (special case with different state)
function renderColumnDropdown(): string {
  const visibleCount = columns.filter((col) => {
    const id = (col as any).accessorKey as string;
    return state.columnVisibility[id] !== false;
  }).length;
  const isOpen = openDropdown === "columns";

  return `
    <div class="multi-select" data-dropdown="columns">
      <button type="button" class="multi-select-btn" data-toggle="columns">
        Columns
        <span class="count">${visibleCount}</span>
        ▼
      </button>
      <div class="multi-select-menu ${isOpen ? "" : "hidden"}" data-menu="columns">
        <div class="select-all">
          <button type="button" class="secondary outline" data-select-all="columns">All</button>
          <button type="button" class="secondary outline" data-select-none="columns">None</button>
        </div>
        ${columns
          .map((col) => {
            const id = (col as any).accessorKey as string;
            const header = typeof (col as any).header === "string" ? (col as any).header : id;
            const checked = state.columnVisibility[id] !== false;
            return `
              <label>
                <input type="checkbox" data-column="${id}" ${checked ? "checked" : ""} />
                ${header}
              </label>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

export async function renderJobs(): Promise<void> {
  const app = getApp();

  // Fetch filter options
  [allAgencies, allCategories, allCivilServiceTitles] = await Promise.all([
    getAgencies(),
    getCategories(),
    getCivilServiceTitles(),
  ]);

  // Build page structure
  app.innerHTML = `
    <h1>NYC Government Jobs</h1>

    <div class="filters" id="filters">
      <div class="search-row">
        <fieldset role="group" class="search-group">
          <input
            type="search"
            name="search"
            id="search-input"
            placeholder="Search jobs..."
            value="${escapeHtml(state.search)}"
          />
          <button type="button" id="search-btn">Search</button>
        </fieldset>
        ${ftsFeatureEnabled && isFtsEnabled() ? `
          <label class="fts-toggle">
            <input type="checkbox" id="use-fts" ${state.useFts ? "checked" : ""} />
            Advanced search
          </label>
        ` : ""}
      </div>

      <div class="filter-row" id="filter-dropdowns">
        ${renderMultiSelectDropdown(
          "agencies",
          "Agency",
          allAgencies.map((a) => ({ value: a, label: a })),
          state.agencies
        )}
        ${renderMultiSelectDropdown(
          "categories",
          "Category",
          allCategories.map((c) => ({ value: c, label: c })),
          state.categories
        )}
        ${renderMultiSelectDropdown(
          "civilServiceTitles",
          "Civil Service Title",
          allCivilServiceTitles.map((t) => ({ value: t, label: t })),
          state.civilServiceTitles
        )}
        ${renderMultiSelectDropdown(
          "careerLevels",
          "Career Level",
          careerLevelOptions.map((l) => ({ value: l, label: l })),
          state.careerLevels
        )}
        ${renderMultiSelectDropdown("fullTime", "Type", fullTimeOptions, state.fullTimeFilter)}
        ${renderMultiSelectDropdown("exam", "Exam", examOptions, state.examFilter)}
        ${renderMultiSelectDropdown("postingType", "Posting", postingTypeOptions, state.postingTypes)}
        ${renderColumnDropdown()}
      </div>

      <div class="filter-row">
        <div class="salary-filter">
          <span>Salary:</span>
          <input type="number" id="salary-min" placeholder="Min" value="${state.salaryMin ?? ""}" />
          <span>to</span>
          <input type="number" id="salary-max" placeholder="Max" value="${state.salaryMax ?? ""}" />
        </div>
      </div>
    </div>

    <div id="results">
      <p aria-busy="true">Loading jobs...</p>
    </div>
  `;

  setupEventHandlers();
  await loadResults();
}

function setupEventHandlers(): void {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
  const salaryMinInput = document.getElementById("salary-min") as HTMLInputElement;
  const salaryMaxInput = document.getElementById("salary-max") as HTMLInputElement;

  // Search button triggers text search
  searchBtn.addEventListener("click", async () => {
    state.search = searchInput.value;
    state.page = 0;
    await loadResults();
  });

  // Enter key in search input triggers search
  searchInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.search = searchInput.value;
      state.page = 0;
      await loadResults();
    }
  });

  // Salary inputs with debounce
  let salaryTimeout: number | null = null;
  const handleSalaryChange = () => {
    if (salaryTimeout) clearTimeout(salaryTimeout);
    salaryTimeout = window.setTimeout(async () => {
      state.salaryMin = salaryMinInput.value ? parseInt(salaryMinInput.value, 10) : null;
      state.salaryMax = salaryMaxInput.value ? parseInt(salaryMaxInput.value, 10) : null;
      state.page = 0;
      await loadResults();
    }, 500);
  };
  salaryMinInput.addEventListener("input", handleSalaryChange);
  salaryMaxInput.addEventListener("input", handleSalaryChange);

  // FTS toggle handler
  const ftsToggle = document.getElementById("use-fts") as HTMLInputElement | null;
  if (ftsToggle) {
    ftsToggle.addEventListener("change", async () => {
      state.useFts = ftsToggle.checked;
      // If there's a search term, re-run the search with new mode
      if (state.search) {
        state.page = 0;
        await loadResults();
      }
    });
  }

  // Dropdown toggle handlers
  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdownId = (btn as HTMLElement).dataset.toggle!;
      if (openDropdown === dropdownId) {
        openDropdown = null;
      } else {
        openDropdown = dropdownId;
      }
      updateDropdownVisibility();
    });
  });

  // Select All / Select None handlers
  document.querySelectorAll("[data-select-all]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const dropdownId = (btn as HTMLElement).dataset.selectAll!;
      selectAllInDropdown(dropdownId, true);
    });
  });

  document.querySelectorAll("[data-select-none]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const dropdownId = (btn as HTMLElement).dataset.selectNone!;
      selectAllInDropdown(dropdownId, false);
    });
  });

  // Checkbox change handlers for filters
  document.querySelectorAll("[data-filter]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const dropdownId = (checkbox as HTMLInputElement).dataset.filter!;
      updateFilterState(dropdownId);
      state.page = 0;
      await loadResults();
      rerenderDropdowns();
    });
  });

  // Column visibility handlers
  document.querySelectorAll("[data-column]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const columnId = (checkbox as HTMLInputElement).dataset.column!;
      state.columnVisibility[columnId] = (checkbox as HTMLInputElement).checked;
      updateTableVisibility();
      rerenderDropdowns();
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".multi-select")) {
      openDropdown = null;
      updateDropdownVisibility();
    }
  });

  // Search within dropdowns
  setupDropdownSearch();
}

function setupDropdownSearch(): void {
  document.querySelectorAll("[data-search]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const searchInput = e.target as HTMLInputElement;
      const dropdownId = searchInput.dataset.search!;
      const searchTerm = searchInput.value.toLowerCase();
      const optionsContainer = document.querySelector(`[data-options="${dropdownId}"]`);

      if (!optionsContainer) return;

      optionsContainer.querySelectorAll("label").forEach((label) => {
        const optionValue = (label as HTMLElement).dataset.optionValue || "";
        const matches = optionValue.includes(searchTerm);
        (label as HTMLElement).style.display = matches ? "" : "none";
      });
    });

    // Prevent closing dropdown when clicking in search
    input.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  });
}

function updateDropdownVisibility(): void {
  document.querySelectorAll("[data-menu]").forEach((menu) => {
    const menuId = (menu as HTMLElement).dataset.menu!;
    if (openDropdown === menuId) {
      menu.classList.remove("hidden");
    } else {
      menu.classList.add("hidden");
    }
  });
}

// Update table's column visibility state and re-render
function updateTableVisibility(): void {
  if (!currentData.length) return;

  // Recreate table with updated visibility state
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
      updateTableVisibility();
    },
    manualSorting: true,
    enableSortingRemoval: false,
    renderFallbackValue: null,
  });

  renderTable();
}

function selectAllInDropdown(dropdownId: string, selectAll: boolean): void {
  if (dropdownId === "columns") {
    columns.forEach((col) => {
      const id = (col as any).accessorKey as string;
      state.columnVisibility[id] = selectAll;
    });
    updateTableVisibility();
    rerenderDropdowns();
  } else {
    const checkboxes = document.querySelectorAll(`[data-filter="${dropdownId}"]`);
    checkboxes.forEach((cb) => {
      (cb as HTMLInputElement).checked = selectAll;
    });
    updateFilterState(dropdownId);
    state.page = 0;
    loadResults().then(() => rerenderDropdowns());
  }
}

function updateFilterState(dropdownId: string): void {
  const checkboxes = document.querySelectorAll(`[data-filter="${dropdownId}"]:checked`);
  const values = Array.from(checkboxes).map((cb) => (cb as HTMLInputElement).value);

  switch (dropdownId) {
    case "agencies":
      state.agencies = values;
      break;
    case "categories":
      state.categories = values;
      break;
    case "civilServiceTitles":
      state.civilServiceTitles = values;
      break;
    case "careerLevels":
      state.careerLevels = values;
      break;
    case "fullTime":
      state.fullTimeFilter = values;
      break;
    case "exam":
      state.examFilter = values;
      break;
    case "postingType":
      state.postingTypes = values;
      break;
  }
}

function rerenderDropdowns(): void {
  const dropdownsContainer = document.getElementById("filter-dropdowns");
  if (!dropdownsContainer) return;

  dropdownsContainer.innerHTML = `
    ${renderMultiSelectDropdown(
      "agencies",
      "Agency",
      allAgencies.map((a) => ({ value: a, label: a })),
      state.agencies
    )}
    ${renderMultiSelectDropdown(
      "categories",
      "Category",
      allCategories.map((c) => ({ value: c, label: c })),
      state.categories
    )}
    ${renderMultiSelectDropdown(
      "civilServiceTitles",
      "Civil Service Title",
      allCivilServiceTitles.map((t) => ({ value: t, label: t })),
      state.civilServiceTitles
    )}
    ${renderMultiSelectDropdown(
      "careerLevels",
      "Career Level",
      careerLevelOptions.map((l) => ({ value: l, label: l })),
      state.careerLevels
    )}
    ${renderMultiSelectDropdown("fullTime", "Type", fullTimeOptions, state.fullTimeFilter)}
    ${renderMultiSelectDropdown("exam", "Exam", examOptions, state.examFilter)}
    ${renderMultiSelectDropdown("postingType", "Posting", postingTypeOptions, state.postingTypes)}
    ${renderColumnDropdown()}
  `;

  // Re-attach event handlers for the new dropdown elements
  setupDropdownHandlers();
}

function setupDropdownHandlers(): void {
  // Dropdown toggle handlers
  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdownId = (btn as HTMLElement).dataset.toggle!;
      if (openDropdown === dropdownId) {
        openDropdown = null;
      } else {
        openDropdown = dropdownId;
      }
      updateDropdownVisibility();
    });
  });

  // Select All / Select None handlers
  document.querySelectorAll("[data-select-all]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const dropdownId = (btn as HTMLElement).dataset.selectAll!;
      selectAllInDropdown(dropdownId, true);
    });
  });

  document.querySelectorAll("[data-select-none]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const dropdownId = (btn as HTMLElement).dataset.selectNone!;
      selectAllInDropdown(dropdownId, false);
    });
  });

  // Checkbox change handlers for filters
  document.querySelectorAll("[data-filter]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const dropdownId = (checkbox as HTMLInputElement).dataset.filter!;
      updateFilterState(dropdownId);
      state.page = 0;
      await loadResults();
      rerenderDropdowns();
    });
  });

  // Column visibility handlers
  document.querySelectorAll("[data-column]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const columnId = (checkbox as HTMLInputElement).dataset.column!;
      state.columnVisibility[columnId] = (checkbox as HTMLInputElement).checked;
      updateTableVisibility();
      rerenderDropdowns();
    });
  });

  // Search within dropdowns
  setupDropdownSearch();
}

async function loadResults(): Promise<void> {
  const scrollY = window.scrollY; // Save scroll position
  const resultsDiv = document.getElementById("results")!;
  resultsDiv.innerHTML = '<p aria-busy="true">Loading jobs...</p>';

  try {
    // Get sort info for DuckDB
    const sortCol = state.sorting[0];
    const orderBy = sortCol ? columnToDbField[sortCol.id] || "posted_date" : "posted_date";
    const orderDir = sortCol?.desc ? "DESC" : "ASC";

    const result = await queryJobs({
      search: state.search || undefined,
      useFts: state.useFts,
      agencies: state.agencies.length > 0 ? state.agencies : undefined,
      categories: state.categories.length > 0 ? state.categories : undefined,
      civilServiceTitles: state.civilServiceTitles.length > 0 ? state.civilServiceTitles : undefined,
      careerLevels: state.careerLevels.length > 0 ? state.careerLevels : undefined,
      fullTimeFilter: state.fullTimeFilter.length > 0 ? state.fullTimeFilter : undefined,
      examFilter: state.examFilter.length > 0 ? state.examFilter : undefined,
      postingTypes: state.postingTypes.length > 0 ? state.postingTypes : undefined,
      salaryMin: state.salaryMin ?? undefined,
      salaryMax: state.salaryMax ?? undefined,
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
    window.scrollTo(0, scrollY); // Restore scroll position
  } catch (error) {
    console.error("Error loading jobs:", error);
    resultsDiv.innerHTML = `<p>Error loading jobs. Please try again.</p>`;
  }
}

function getFilterSummary(): string {
  const parts: string[] = [];

  if (state.search) {
    parts.push(`Search: "${escapeHtml(state.search)}"`);
  }
  if (state.agencies.length > 0) {
    parts.push(`Agency: ${state.agencies.map(escapeHtml).join(", ")}`);
  }
  if (state.categories.length > 0) {
    parts.push(`Category: ${state.categories.map(escapeHtml).join(", ")}`);
  }
  if (state.civilServiceTitles.length > 0) {
    parts.push(`Civil Service Title: ${state.civilServiceTitles.map(escapeHtml).join(", ")}`);
  }
  if (state.careerLevels.length > 0) {
    parts.push(`Career Level: ${state.careerLevels.map(escapeHtml).join(", ")}`);
  }
  if (state.fullTimeFilter.length === 1) {
    parts.push(state.fullTimeFilter[0] === "full_time" ? "Full-time only" : "Part-time only");
  }
  if (state.examFilter.length === 1) {
    parts.push(state.examFilter[0] === "requires_exam" ? "Exam required" : "No exam required");
  }
  if (state.postingTypes.length === 1) {
    parts.push(`${state.postingTypes[0]} postings only`);
  }
  if (state.salaryMin != null || state.salaryMax != null) {
    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    if (state.salaryMin != null && state.salaryMax != null) {
      parts.push(`Salary: ${fmt.format(state.salaryMin)} - ${fmt.format(state.salaryMax)}`);
    } else if (state.salaryMin != null) {
      parts.push(`Salary: ${fmt.format(state.salaryMin)}+`);
    } else if (state.salaryMax != null) {
      parts.push(`Salary: up to ${fmt.format(state.salaryMax)}`);
    }
  }

  return parts.length > 0 ? parts.join(" · ") : "";
}

function renderTable(): void {
  if (!table) return;

  const resultsDiv = document.getElementById("results")!;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  const filterSummary = getFilterSummary();

  resultsDiv.innerHTML = `
    <p><strong>${totalCount}</strong> jobs found${filterSummary ? ` <span class="filter-summary">· ${filterSummary}</span>` : ""}</p>

    ${
      rows.length > 0
        ? `
      <div class="table-container">
        <table class="job-table">
          <thead>
            ${headerGroups
              .map(
                (headerGroup) => `
              <tr>
                ${headerGroup.headers
                  .map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    const sortIcon = sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : "";
                    return `
                    <th ${canSort ? `class="sortable" data-column-id="${header.id}"` : ""}>
                      ${header.isPlaceholder ? "" : header.column.columnDef.header}${sortIcon}
                    </th>
                  `;
                  })
                  .join("")}
              </tr>
            `
              )
              .join("")}
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>
                ${row
                  .getVisibleCells()
                  .map((cell) => {
                    const job = row.original;
                    const colId = cell.column.id;
                    let value: string;

                    switch (colId) {
                      case "business_title":
                        const categories =
                          job.job_categories.length > 0
                            ? `<br><small>${job.job_categories.map((c) => escapeHtml(c)).join(", ")}</small>`
                            : "";
                        value = `<a href="#/jobs/${escapeHtml(job.id)}" class="job-link">${escapeHtml(job.business_title)}</a>${categories}`;
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
                      case "civil_service_title":
                        value = escapeHtml(job.civil_service_title || "—");
                        break;
                      case "title_classification":
                        value = escapeHtml(job.title_classification || "—");
                        break;
                      case "is_full_time":
                        value = job.is_full_time ? "Yes" : "No";
                        break;
                      default:
                        value = String(cell.getValue() ?? "");
                    }
                    return `<td>${value}</td>`;
                  })
                  .join("")}
              </tr>
            `
              )
              .join("")}
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
