function getApp(): HTMLElement {
  return document.getElementById("app")!;
}

export function renderResources(): void {
  const app = getApp();

  app.innerHTML = `
    <article class="content-page">
      <h1>Additional Resources</h1>

      <section>
        <h2>Official NYC Employment</h2>
        <ul>
          <li>
            <a href="https://cityjobs.nyc.gov" target="_blank">
              <strong>NYC Jobs Portal</strong>
            </a>
            — Official job board and application system
          </li>
          <li>
            <a href="https://www.nyc.gov/site/dcas/employment/employment.page" target="_blank">
              <strong>DCAS Employment</strong>
            </a>
            — Department of Citywide Administrative Services employment info
          </li>
          <li>
            <a href="https://www.nyc.gov/site/dcas/employment/exams-open-for-application.page" target="_blank">
              <strong>Civil Service Exams</strong>
            </a>
            — Current exam schedule and applications
          </li>
        </ul>
      </section>

      <section>
        <h2>NYC Government Agencies</h2>
        <ul>
          <li>
            <a href="https://www.nyc.gov/nyc-resources/agencies.page" target="_blank">
              <strong>NYC Agency Directory</strong>
            </a>
            — Complete list of city agencies
          </li>
          <li>
            <a href="https://www.nyc.gov/content/opa/pages/" target="_blank">
              <strong>Mayor's Office of Operations</strong>
            </a>
            — City performance and operations
          </li>
        </ul>
      </section>

      <section>
        <h2>Career Development</h2>
        <ul>
          <li>
            <a href="https://www.nyc.gov/site/dcas/employment/civil-service-101.page" target="_blank">
              <strong>Civil Service 101</strong>
            </a>
            — Guide to NYC civil service system
          </li>
          <li>
            <a href="https://www.nyc.gov/site/dcas/employment/exam-preparation.page" target="_blank">
              <strong>Exam Preparation</strong>
            </a>
            — Resources to prepare for civil service exams
          </li>
          <li>
            <a href="https://www.nyc.gov/site/dcas/employment/veterans.page" target="_blank">
              <strong>Veterans</strong>
            </a>
            — Employment resources for veterans
          </li>
        </ul>
      </section>

      <section>
        <h2>Open Data</h2>
        <ul>
          <li>
            <a href="https://data.cityofnewyork.us/City-Government/NYC-Jobs/kpav-sd4t" target="_blank">
              <strong>NYC Jobs Dataset</strong>
            </a>
            — Source data on NYC Open Data
          </li>
          <li>
            <a href="https://data.cityofnewyork.us" target="_blank">
              <strong>NYC Open Data</strong>
            </a>
            — All publicly available NYC datasets
          </li>
        </ul>
      </section>
    </article>
  `;
}
