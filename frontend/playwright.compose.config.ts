import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "queue-lifecycle.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: process.env.KEZEK_E2E_BASE_URL ?? "http://127.0.0.1:18080",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
