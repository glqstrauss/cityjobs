/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  base: "https://storage.googleapis.com/cityjobs-data/",
  plugins: [wasm(), topLevelAwait()],
  worker: {
    plugins: () => [wasm(), topLevelAwait()],
  },
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
  },
  test: {
    // Use Node environment for testing
    environment: "node",
    // Include test files
    include: ["src/**/*.test.ts"],
  },
});
