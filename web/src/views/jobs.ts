import { queryJobs, getAgencies, getCategories, Job } from "../db";

const PAGE_SIZE = 25;

interface State {
  search: string;
  agency: string;
  category: string;
  page: number;
}

const state: State = {
  search: "",
  agency: "",
  category: "",
  page: 0,
};

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
        <button type="submit">Search</button>
      </fieldset>
    </form>

    <div id="results">
      <p aria-busy="true">Loading jobs...</p>
    </div>
  `;

  // Set up form handler
  const form = document.getElementById("filters") as HTMLFormElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    state.search = formData.get("search") as string;
    state.agency = formData.get("agency") as string;
    state.category = formData.get("category") as string;
    state.page = 0;
    await loadResults();
  });

  // Initial load
  await loadResults();
}

async function loadResults(): Promise<void> {
  const resultsDiv = document.getElementById("results")!;
  resultsDiv.innerHTML = '<p aria-busy="true">Loading jobs...</p>';

  try {
    const { rows, totalCount } = await queryJobs({
      search: state.search || undefined,
      agency: state.agency || undefined,
      category: state.category || undefined,
      limit: PAGE_SIZE,
      offset: state.page * PAGE_SIZE,
    });

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    resultsDiv.innerHTML = `
      <p><strong>${totalCount}</strong> jobs found</p>

      ${
        rows.length > 0
          ? `
        <table class="job-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Agency</th>
              <th>Salary</th>
              <th>Posted</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((job) => renderJobRow(job)).join("")}
          </tbody>
        </table>

        <div class="pagination">
          <button id="prev-page" ${state.page === 0 ? "disabled" : ""}>Previous</button>
          <span>Page ${state.page + 1} of ${totalPages}</span>
          <button id="next-page" ${state.page >= totalPages - 1 ? "disabled" : ""}>Next</button>
        </div>
      `
          : `<p>No jobs match your criteria.</p>`
      }
    `;

    // Set up pagination handlers
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

    // Set up row click handlers
    document.querySelectorAll(".job-row").forEach((row) => {
      row.addEventListener("click", () => {
        const jobId = (row as HTMLElement).dataset.jobId;
        if (jobId) {
          window.location.hash = `#/jobs/${jobId}`;
        }
      });
    });
  } catch (error) {
    console.error("Error loading jobs:", error);
    resultsDiv.innerHTML = `<p>Error loading jobs. Please try again.</p>`;
  }
}

function renderJobRow(job: Job): string {
  const salary = formatSalary(job);
  const posted = formatDate(job.posted_date);

  return `
    <tr class="job-row" data-job-id="${escapeHtml(job.job_id)}">
      <td>
        <strong>${escapeHtml(job.business_title)}</strong>
        ${job.job_categories.length > 0 ? `<br><small>${job.job_categories.map((c) => escapeHtml(c)).join(", ")}</small>` : ""}
      </td>
      <td>${escapeHtml(job.agency)}</td>
      <td class="salary">${salary}</td>
      <td>${posted}</td>
    </tr>
  `;
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
