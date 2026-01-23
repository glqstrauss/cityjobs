import { initDb, getSourceUpdatedAt } from "./db";
import { initRouter } from "./router";

async function main() {
  // Initialize DuckDB and load data
  await initDb();

  // Update footer with last updated date
  const lastUpdated = getSourceUpdatedAt();
  if (lastUpdated) {
    const dateStr = lastUpdated.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const footer = document.querySelector("footer small");
    if (footer) {
      footer.innerHTML = `Data from <a href="https://data.cityofnewyork.us" target="_blank">NYC Open Data</a>. Last updated ${dateStr}.`;
    }
  }

  // Start router
  initRouter();
}

main().catch(console.error);
