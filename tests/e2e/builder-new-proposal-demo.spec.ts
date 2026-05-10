import { expect, test } from "@playwright/test";

test("Builder new proposal route handles a stale draft id without a Convex query crash", async ({
  page,
}) => {
  await page.goto(
    "/demo/drawflow/new-proposal?draftId=rn7djn5t9m71njwpdhyk5dkeh986ckvm"
  );
  await expect(page.getByText("Builder proposal draft not found")).toBeVisible();
  await expect(page.getByText("Start a fresh draft to continue")).toBeVisible();
});

test("Builder dashboard to new proposal demo reaches the workspace boundary without opening the workspace demo", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/builder-dashboard");
  await expect(page.getByTestId("builder-dashboard-shell")).toBeVisible();
  await page.getByTestId("builder-dashboard-reset").click();
  await expect(page.getByTestId("builder-dashboard-reset")).toBeEnabled();

  await page.getByTestId("builder-dashboard-new-proposal").click();
  await expect(page).toHaveURL(/\/demo\/drawflow\/new-proposal\?draftId=/);
  await expect(page.getByTestId("builder-template-screen")).toBeVisible();

  await page.getByTestId("builder-total-budget").fill("0");
  await page.getByTestId("builder-generate-milestones").click();
  await expect(page.getByTestId("builder-template-error")).toContainText(
    "positive total project budget"
  );

  await page.getByTestId("builder-total-budget").fill("$1,850,000");
  await page
    .getByTestId("builder-template-card-single_family_full_build")
    .click();
  await page.getByTestId("builder-generate-milestones").click();
  await expect(page.getByTestId("builder-milestone-editor")).toBeVisible();
  await expect(page.getByTestId(/^builder-milestone-row-/)).toHaveCount(10);
  await expect(
    page.getByTestId("builder-readiness-blockers")
  ).toContainText("cash availability");
  await page.getByTestId("builder-continue-workspace").click();
  await expect(page.getByTestId("builder-action-error")).toContainText(
    "cash availability"
  );
  await page.getByTestId("builder-cash-availability").fill("$260,000");
  await page.keyboard.press("Tab");

  await page
    .getByTestId("builder-milestone-toggle-permits_mobilization")
    .click();
  await expect(page.getByTestId("builder-readiness-blockers")).toContainText(
    "differs from the original budget"
  );
  await page
    .getByTestId("builder-milestone-toggle-permits_mobilization")
    .click();

  await page.getByTestId("builder-add-bank-item").click();
  await expect(
    page.getByTestId("builder-milestone-row-landscape_exterior_punch")
  ).toBeVisible();
  await page.getByTestId("builder-add-custom-milestone").click();
  await expect(page.getByTestId(/^builder-milestone-row-custom_/)).toHaveCount(1);

  await page
    .getByTestId("builder-milestone-budget-permits_mobilization")
    .fill("$0");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("builder-readiness-blockers")).toContainText(
    "Permits and mobilization needs a positive budget"
  );
  await page.getByTestId("builder-continue-workspace").click();
  await expect(page.getByTestId("builder-action-error")).toContainText(
    "Permits and mobilization needs a positive budget"
  );

  await page
    .getByTestId("builder-milestone-budget-permits_mobilization")
    .fill("$95,000");
  await page.keyboard.press("Tab");
  await page
    .getByTestId("builder-milestone-duration-permits_mobilization")
    .fill("15");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("builder-peak-exposure")).toContainText(
    "warning"
  );
  await expect(page.getByTestId("builder-readiness-blockers")).toContainText(
    "Completeness checks passed"
  );

  await page.getByTestId("builder-continue-workspace").click();
  await expect(page.getByTestId("builder-boundary-screen")).toBeVisible();
  await expect(page.getByTestId("builder-boundary-payload-summary")).toContainText(
    "demo_workspaceBoundaryPayload"
  );
  await expect(page.getByText('"reimbursementOnly": true')).toBeVisible();
  await expect(page).toHaveURL(/\/demo\/drawflow\/new-proposal\?draftId=/);
  await expect(page).not.toHaveURL(/\/demo\/drawflow\/(proposal|active)/);
  await page.screenshot({
    fullPage: true,
    path: "test-results/builder-new-proposal-boundary.png",
  });
});
