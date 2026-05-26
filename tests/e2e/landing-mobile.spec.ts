import { expect, test } from "@playwright/test";

test("landing page header stays usable on mobile", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
  await page.goto(baseUrl ? new URL("/", baseUrl).toString() : "/");

  await expect(
    page.getByText("DrawFlow · Coupled control system")
  ).toBeVisible();
  const navigation = page.getByRole("navigation");
  await expect(
    navigation.getByRole("link", { name: "drawFlow" })
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Demos" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Sign in" })).toBeVisible();

  const mobileMetrics = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const sheetBar = document.querySelector(".lbp-sheet-bar");
    const header = document.querySelector("header");
    const firstSchedule = document.querySelector(".lbp-schedule");
    const undersizedTapTargets = [...document.querySelectorAll("a,button")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          height: rect.height,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
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
      headerHeight: header?.getBoundingClientRect().height ?? 0,
      scheduleHasHorizontalScroll:
        firstSchedule?.parentElement != null &&
        firstSchedule.parentElement.scrollWidth >
          firstSchedule.parentElement.clientWidth,
      scheduleHeight: firstSchedule?.getBoundingClientRect().height ?? 0,
      sheetBarHeight: sheetBar?.getBoundingClientRect().height ?? 0,
      sheetBarWidth: sheetBar?.getBoundingClientRect().width ?? 0,
      undersizedTapTargetCount: undersizedTapTargets.length,
      viewportWidth,
    };
  });

  expect(mobileMetrics.hasDocumentOverflow).toBe(false);
  expect(mobileMetrics.sheetBarWidth).toBe(mobileMetrics.viewportWidth);
  expect(mobileMetrics.sheetBarHeight).toBeLessThan(48);
  expect(mobileMetrics.headerHeight).toBeLessThan(72);
  expect(mobileMetrics.scheduleHasHorizontalScroll).toBe(false);
  expect(mobileMetrics.scheduleHeight).toBeLessThan(1300);
  expect(mobileMetrics.undersizedTapTargetCount).toBe(0);
});
