import { expect, test } from "@playwright/test";

test("landing page header stays usable on mobile", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
  await page.goto(baseUrl ? new URL("/", baseUrl).toString() : "/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "One entry point. Your DrawFlow workspace.",
    })
  ).toBeVisible();

  const header = page.getByRole("banner");
  await expect(
    header.getByRole("link", { name: "DrawFlow access portal" })
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Workspace access" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to secure sign in" })
  ).toBeVisible();

  const mobileMetrics = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const headerElement = document.querySelector("header");
    const intro = document.querySelector(".access-intro");
    const workspaceAccess = document.querySelector(".access-selector-section");
    const undersizedTapTargets = [...document.querySelectorAll("a,button")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ??
            "",
          tagName: element.tagName.toLowerCase(),
          height: rect.height,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.bottom > 0 &&
            rect.left < viewportWidth &&
            rect.top < window.innerHeight &&
            style.display !== "none" &&
            style.visibility !== "hidden",
          width: rect.width,
        };
      })
      .filter(
        (target) => target.visible && (target.width < 44 || target.height < 44)
      );

    return {
      hasDocumentOverflow:
        document.documentElement.scrollWidth > viewportWidth ||
        document.body.scrollWidth > viewportWidth,
      headerHeight: headerElement?.getBoundingClientRect().height ?? 0,
      headerWidth: headerElement?.getBoundingClientRect().width ?? 0,
      introWidth: intro?.getBoundingClientRect().width ?? 0,
      undersizedTapTargets,
      viewportWidth,
      workspaceAccessWidth: workspaceAccess?.getBoundingClientRect().width ?? 0,
    };
  });

  expect(mobileMetrics.hasDocumentOverflow).toBe(false);
  expect(mobileMetrics.headerWidth).toBe(mobileMetrics.viewportWidth);
  expect(mobileMetrics.headerHeight).toBeLessThanOrEqual(72);
  expect(mobileMetrics.introWidth).toBe(mobileMetrics.viewportWidth);
  expect(mobileMetrics.workspaceAccessWidth).toBe(mobileMetrics.viewportWidth);
  expect(mobileMetrics.undersizedTapTargets).toEqual([]);
});
