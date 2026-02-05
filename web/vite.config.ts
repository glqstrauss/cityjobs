/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "VITE_");
  return {
    base: env.VITE_BUCKET_URL ? `${env.VITE_BUCKET_URL}/` : "/",
    envDir: "..",
    plugins: [wasm(), topLevelAwait()],
    worker: {
      plugins: () => [wasm(), topLevelAwait()],
    },
    optimizeDeps: {
      exclude: ["@duckdb/duckdb-wasm"],
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
