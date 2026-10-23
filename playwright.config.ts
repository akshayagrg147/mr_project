import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4010",
    viewport: { width: 1440, height: 1024 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "node --import tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:4010/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
