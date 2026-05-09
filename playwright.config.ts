import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  reporter: [["list"]],
  testDir: "./tests/e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun run dev",
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
