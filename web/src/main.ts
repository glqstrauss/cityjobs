import { initDb } from "./db";
import { initRouter } from "./router";

async function main() {
  // Initialize DuckDB and load data
  await initDb();

  // Start router
  initRouter();
}

main().catch(console.error);
