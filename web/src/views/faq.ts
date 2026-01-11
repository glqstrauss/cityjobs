function getApp(): HTMLElement {
  return document.getElementById("app")!;
}

export function renderFaq(): void {
  const app = getApp();

  app.innerHTML = `
    <article class="content-page">
      <h1>Frequently Asked Questions</h1>

      <section>
        <h2>What is this site?</h2>
        <p>
          This is an unofficial, independently-run job board that displays current job
          openings with New York City government agencies. It provides a fast, searchable
          interface to help you find city government jobs.
        </p>
      </section>

      <section>
        <h2>Where does the data come from?</h2>
        <p>
          All job data comes from
          <a href="https://data.cityofnewyork.us/City-Government/NYC-Jobs/kpav-sd4t" target="_blank">
            NYC Open Data
          </a>, the official public data portal for New York City. The data is published
          by the NYC Department of Citywide Administrative Services (DCAS).
        </p>
      </section>

      <section>
        <h2>How often is it updated?</h2>
        <p>
          Job listings are refreshed daily from NYC Open Data. The source dataset is
          typically updated every weekday by city staff.
        </p>
      </section>

      <section>
        <h2>How do I apply for a job?</h2>
        <p>
          Click on any job listing to see full details, then click "Apply on NYC Jobs"
          to be taken to the official application page. All applications are submitted
          through the official
          <a href="https://cityjobs.nyc.gov" target="_blank">NYC Jobs portal</a>.
        </p>
      </section>

      <section>
        <h2>What does "Competitive" vs "Non-Competitive" mean?</h2>
        <p>
          <strong>Competitive</strong> positions require you to take and pass a civil
          service exam before you can be hired. Your score on the exam determines your
          ranking on an eligibility list.
        </p>
        <p>
          <strong>Non-Competitive</strong> positions do not require an exam. Hiring
          managers can select candidates based on qualifications and interviews.
        </p>
      </section>

      <section>
        <h2>What are civil service exams?</h2>
        <p>
          Civil service exams are tests administered by DCAS that evaluate candidates
          for competitive city positions. Exams may be written tests, performance tests,
          or evaluations of training and experience.
        </p>
        <p>
          Visit the
          <a href="https://www.nyc.gov/site/dcas/employment/exams-open-for-application.page" target="_blank">
            DCAS Exams page
          </a>
          to see current exam schedules and apply.
        </p>
      </section>

      <section>
        <h2>Do I need to be a NYC resident?</h2>
        <p>
          Residency requirements vary by position. Many jobs require NYC residency at
          the time of appointment or within a certain period after hiring. Check the
          specific job listing for residency requirements.
        </p>
      </section>

      <section>
        <h2>Is this site affiliated with NYC government?</h2>
        <p>
          No. This is an independent project that uses publicly available data. For
          official information, visit
          <a href="https://cityjobs.nyc.gov" target="_blank">cityjobs.nyc.gov</a>.
        </p>
      </section>
    </article>
  `;
}
