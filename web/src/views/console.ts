import { embed } from "@duckdb/duckdb-wasm-shell";
import shellWasm from "@duckdb/duckdb-wasm-shell/dist/shell_bg.wasm?url";
import "xterm/css/xterm.css";
import { getDb } from "../db";

export async function renderConsole(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) return;

  const db = getDb();
  if (!db) {
    app.innerHTML = `
      <article>
        <h2>Console</h2>
        <p>Database not initialized. Please wait for the database to load.</p>
        <a href="#/jobs">Back to Jobs</a>
      </article>
    `;
    return;
  }

  app.innerHTML = `
    <article>
      <header>
        <h2>DuckDB Console</h2>
        <p>Query the jobs data directly. The <code>jobs</code> table is already loaded.</p>
        <p><a href="#/jobs">Back to Jobs</a></p>
      </header>
      <div id="shell-container" style="height: 500px; width: 100%;"></div>
    </article>
  `;

  const container = document.getElementById("shell-container") as HTMLDivElement;
  if (!container) return;

  // Wait for DOM to be fully rendered
  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    // Fetch the shell WASM module
    const shellModule = await fetch(shellWasm).then((r) => r.arrayBuffer());

    await embed({
      shellModule,
      container,
      resolveDatabase: async () => db,
    });
  } catch (error) {
    console.error("Failed to embed shell:", error);
    container.innerHTML = `<p>Failed to load console: ${error}</p>`;
  }
}
