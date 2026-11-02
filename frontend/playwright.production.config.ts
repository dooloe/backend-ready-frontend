import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-production",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:18080",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "../backend/.venv/bin/python ../backend/production_e2e_server.py",
    url: "http://127.0.0.1:18080/api/organizations",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
