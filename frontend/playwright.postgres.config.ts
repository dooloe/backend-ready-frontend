import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-postgres",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: process.env.KEZEK_E2E_BASE_URL ?? "http://127.0.0.1:18080",
    trace: "retain-on-failure",
  },
  projects: [{ name: "postgres-desktop", use: { ...devices["Desktop Chrome"] } }],
});
