import { expect, test } from "@playwright/test";

test("admin evidence package opens a review modal and does not claim missing reports are attached", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/admin-build-dashboard");
  await expect(page.getByTestId("admin-build-dashboard-shell")).toBeVisible();

  const evidencePackage = page.getByTestId(/^admin-evidence-package-/).first();
  await expect(evidencePackage).toBeVisible();
  await expect(evidencePackage).toContainText("No builder report");
  await expect(evidencePackage).toContainText(
    "No builder report or supporting files have been submitted."
  );
  await expect(evidencePackage).not.toContainText("Builder report attached");

  await evidencePackage.click();
  await expect(
    page.getByRole("heading", { name: "Evidence package review" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No builder report" })
  ).toBeVisible();
  await expect(
    page.getByText(
      "No builder report or supporting files have been submitted for this milestone yet."
    )
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve Evidence" })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Request More Information" })
  ).toBeEnabled();
});

test("admin review has site visit quick actions and draw group aggregate breadcrumb", async ({
  page,
}) => {
  await page.goto("/demo/drawflow/admin-build-dashboard");
  await expect(page.getByTestId("admin-build-dashboard-shell")).toBeVisible();

  await expect(
    page.getByText(
      "Evidence packages group related photos and reports together."
    )
  ).toHaveCount(0);

  await expect(
    page.getByTestId("admin-assign-site-visit-inline")
  ).toBeVisible();
  await page.getByTestId("admin-start-site-visit-inline").click();
  const requestSiteVisitDialog = page.getByRole("dialog", {
    name: "Request site visit",
  });
  await expect(requestSiteVisitDialog).toBeVisible();
  await expect(requestSiteVisitDialog.getByText("Permits", { exact: true })).toHaveCount(2);
  await requestSiteVisitDialog
    .getByRole("textbox", { name: "Request reason" })
    .fill("Observed incomplete work.");
  await expect(
    requestSiteVisitDialog.getByRole("button", { name: "Generate Token" })
  ).toBeEnabled();
  await requestSiteVisitDialog
    .getByRole("button", { name: "Close" })
    .first()
    .click();
  await expect(requestSiteVisitDialog).toHaveCount(0);

  await page.getByTestId("admin-breadcrumb-draw-group").click();
  await expect(
    page.getByTestId("admin-draw-group-aggregate-summary")
  ).toBeVisible();
  await expect(page.getByText("Draw Group Milestones")).toBeVisible();
  await page.getByTestId("admin-breadcrumb-milestone").click();
  await expect(page.getByText("Milestone Status")).toBeVisible();
});
