import { initDb, getSourceUpdatedAt } from "./db";
import { initRouter } from "./router";

async function main() {
  // Initialize DuckDB and load data
  await initDb();

  // Update footer with last updated date
  const lastUpdated = getSourceUpdatedAt();
  if (lastUpdated) {
    const el = document.getElementById("last-updated");
    if (el) {
      el.textContent = lastUpdated.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  // Start router
  initRouter();
}

main().catch(console.error);
