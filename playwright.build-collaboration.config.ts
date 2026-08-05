import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  reporter: [
    [process.env.CI ? "github" : "line"],
    [
      "html",
      {
        open: "never",
        outputFolder: "playwright-report",
      },
    ],
    [
      "json",
      {
        outputFile: "playwright-report/build-collaboration-results.json",
      },
    ],
  ],
  use: {
    ...baseConfig.use,
    trace: "on",
  },
});
