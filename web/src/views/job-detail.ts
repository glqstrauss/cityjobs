import { getJob, getJobUrl, Job } from "../db";

function getApp(): HTMLElement {
  return document.getElementById("app")!;
}

export async function renderJobDetail(jobId: string): Promise<void> {
  const app = getApp();

  const job = await getJob(jobId);

  if (!job) {
    app.innerHTML = `
      <article>
        <h2>Job Not Found</h2>
        <p>This job posting may have been removed or expired.</p>
        <a href="#/jobs">Browse Jobs</a>
      </article>
    `;
    return;
  }

  app.innerHTML = `
    <nav aria-label="breadcrumb">
      <ul>
        <li><a href="#/jobs">Jobs</a></li>
        <li>${escapeHtml(job.business_title)}</li>
      </ul>
    </nav>

    <article class="job-detail">
      <header>
        <h1>${escapeHtml(job.business_title)}</h1>
        <p class="meta">
          <span><strong>${escapeHtml(job.agency)}</strong></span>
          ${job.work_location ? `<span>${escapeHtml(job.work_location)}</span>` : ""}
          <span>${job.is_full_time ? "Full-time" : "Part-time"}</span>
        </p>
        ${
          job.job_categories.length > 0
            ? `
          <p class="categories">
            ${job.job_categories.map((c) => `<span class="category-tag">${escapeHtml(c)}</span>`).join("")}
          </p>
        `
            : ""
        }
      </header>

      <section>
        <h3>Salary</h3>
        <p>${formatSalary(job)}</p>
      </section>

      ${
        job.job_description
          ? `
        <section>
          <h3>Description</h3>
          <div>${formatDescription(job.job_description)}</div>
        </section>
      `
          : ""
      }

      ${
        job.minimum_qual_requirements
          ? `
        <section>
          <h3>Minimum Qualifications</h3>
          <div>${formatDescription(job.minimum_qual_requirements)}</div>
        </section>
      `
          : ""
      }

      <section>
        <h3>Details</h3>
        <dl>
          <dt>Civil Service Title</dt>
          <dd>${escapeHtml(job.civil_service_title || "—")}</dd>

          <dt>Title Classification</dt>
          <dd>${escapeHtml(job.title_classification || "—")} ${job.requires_exam ? "(Exam Required)" : ""}</dd>

          <dt>Career Level</dt>
          <dd>${escapeHtml(job.career_level || "—")}</dd>

          <dt>Number of Positions</dt>
          <dd>${escapeHtml(job.number_of_positions || "—")}</dd>

          ${
            job.division_work_unit
              ? `
            <dt>Division/Work Unit</dt>
            <dd>${escapeHtml(job.division_work_unit)}</dd>
          `
              : ""
          }

          ${
            job.residency_requirement
              ? `
            <dt>Residency Requirement</dt>
            <dd>${escapeHtml(job.residency_requirement)}</dd>
          `
              : ""
          }
        </dl>
      </section>

      <section>
        <h3>Posting Information</h3>
        <dl>
          <dt>Posted</dt>
          <dd>${formatDate(job.posted_date)}</dd>

          <dt>Post Until</dt>
          <dd>${formatDate(job.posted_until_date)}</dd>

          ${
            job.posting_updated_date
              ? `
            <dt>Last Updated</dt>
            <dd>${formatDate(job.posting_updated_date)}</dd>
          `
              : ""
          }
        </dl>
      </section>

      <footer>
        <a
          href="${getJobUrl(job)}"
          target="_blank"
          role="button"
        >
          Apply on NYC Jobs
        </a>
        <a href="#/jobs" role="button" class="secondary">Back to Search</a>
      </footer>
    </article>
  `;
}

function formatSalary(job: Job): string {
  if (!job.salary_range_from) return "Not specified";

  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const from = fmt.format(job.salary_range_from);
  const to = job.salary_range_to ? fmt.format(job.salary_range_to) : null;
  const freq = job.salary_frequency || "Annual";

  if (to && job.salary_range_to !== job.salary_range_from) {
    return `${from} - ${to} (${freq})`;
  }
  return `${from} (${freq})`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDescription(text: string): string {
  // Convert line breaks to paragraphs, escape HTML
  const escaped = escapeHtml(text);
  const paragraphs = escaped.split(/\n\n+/).filter((p) => p.trim());

  if (paragraphs.length > 1) {
    return paragraphs.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  }

  return `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
