import { defineConfig } from "vitest/config";
import path from "node:path";

const here = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    testTimeout: 90_000,
    hookTimeout: 120_000,
    // Each test file opens its own in-memory PostgreSQL; sequential files keep
    // memory bounded and make failures attributable.
    fileParallelism: false,
    sequence: { concurrent: false },
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      // Tests must never reach a real model or a real payment provider.
      LLM_PROVIDER: "none",
      HARNESS_MODE: "SIMULATED",
      JUDGE_SERVICE_URL: "",
    },
    reporters: ["default"],
  },
  resolve: {
    alias: { "@": path.resolve(here, "./src"), "~": path.resolve(here, "./") },
  },
});
