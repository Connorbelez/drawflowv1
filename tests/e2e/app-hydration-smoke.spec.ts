import { expect, test } from "@playwright/test";

test("the application hydrates without a white screen", async ({ page }) => {
  const runtimeErrors: string[] = [];
  const failedResources: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResources.push(`${response.status()} ${response.url()}`);
    }
  });

  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  const response = await page.goto(new URL("/", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1000);

  await expect(response?.status()).toBe(200);
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page.locator("body")).toContainText("DrawFlow");
  expect(failedResources).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
